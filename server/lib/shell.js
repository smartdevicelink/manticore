//functionality of manticore with asynchronous behavior and dependencies for integration testing
var consuler;
var nomader = require('nomad-helper');
var core = require('./core.js');
var needle = require('needle');
var uuid = require('node-uuid');
var randomString = require('randomstring');
var exec = require('child_process').exec;
var fs = require('fs');
var ip = require('ip');
var logger = require('../lib/logger');
var AWS = require('aws-sdk');
AWS.config.update({region: process.env.AWS_REGION});
var ec2;
var nomadAddress;
var self;
var io;

module.exports = {
	init: function (address, socketIo, callback) {
		consuler = require('consul-helper')(address);
		//set the address
		nomadAddress = address + ":4646";
		logger.debug("Nomad address: " + nomadAddress);
		self = this; //keep a consistent context around
		io = socketIo;
		//set up AWS SDK. assume this EC2 instance has an IAM role so we don't need to put in extra credentials
		/*ec2 = new AWS.EC2();
		var params = {
			GroupId: "",

		}
		console.log(ec2.modifyInstanceAttribute);
		ec2.describeSecurityGroups({}, function (err, data) {
			console.log(data.SecurityGroups[16].IpPermissions);
			console.log(data.SecurityGroups[16].IpPermissionsEgress);
		});
		//make a security group because why not
		var params = {
			Description: "Im computer generated!",
			GroupName: "Please delete me"
		};
		ec2.createSecurityGroup(params, function (err, data) {
			console.log(err);
			console.log(data);
		});*/
		consuler.setKeyValue("manticore/filler", "Keep me here please!", function () {
			callback();
		});
	},
	startWatches: function (postUrl) {
		//set a watch for the KV store
		consuler.watchKVStore("manticore/", keysWatch);

		function keysWatch (keys) {
			//if keys is undefined, set it to an empty array
			keys = keys || [];
			keys = core.filterKeys(keys, "manticore/requests/");
			logger.debug("KV store update (after filtering)");
			logger.debug(keys);

			//set up an expectation that we want the values of <keys.length> keys.
			//send a callback function about what to do once we get all the values
			var expecting = core.expect(keys.length, function (job) {
				core.checkJobs(job, function () {//there are tasks. submit the job
					logger.debug("Core tasks exist");
					job.submitJob(nomadAddress, function (result) {
						logger.debug(result);
					});
				}, function () { //there are no tasks. delete the job
					logger.debug("No core tasks");
					self.deleteJob("core", function () {});
				});
			});
			for (let i = 0; i < keys.length; i++) {
				//go through each key and get their value. send the value to expecting
				//expecting will keep track of how many more keys are left
				consuler.getKeyValue(keys[i], function (value) {
					expecting.send(keys[i], value);
				});
			}		
		}

		//set up a watch for all services
		consuler.watchServices(serviceWatch);

		function serviceWatch (services) {
			logger.debug("Services update");
			//services updated. get information about core and hmi if possible
			let cores = services.filter("core-master");
			let hmis = services.filter("hmi-master");
			logger.debug("Core services: " + cores.length);
			logger.debug("Hmi services: " + hmis.length);
			//for every core service, ensure it has a corresponding HMI
			var job = nomader.createJob("hmi");
			core.addHmisToJob(job, cores);
			//submit the job. if there are no task groups then
			//we want to remove the job completely. delete the job in that case
			core.checkJobs(job, function () {//there are tasks
				logger.debug("HMI tasks exist");
				job.submitJob(nomadAddress, function (result) {
					logger.debug(result);
				});
			}, function () { //there are no tasks
				logger.debug("No HMI tasks");
				self.deleteJob("hmi", function () {});
			});

			var pairs = core.findPairs(cores, hmis, function (userId) {
				//remove user from KV store because the HMI has no paired core which
				//indicates that the user exited the HMI page and is done with their instance
				self.deleteKey("manticore/requests/" + userId, function () {});
			});
			pairs = {
				pairs: pairs
			};
			//post all pairs at once
			logger.info(pairs);
			needle.post(postUrl, pairs, function (err, res) {
			});

			//if HAPROXY_OFF was not set to "true". write the file and reload haproxy
			core.checkHaProxyFlag(function () {
				//create an haproxy file and write it so that haproxy notices it
				//use the pairs because that has information about what addresses to use
				//NOTE: the user that runs manticore should own this directory or it may not write to the file!
				logger.debug("Updating HAProxy conf file");
				var file = core.generateHAProxyConfig(pairs);

			    fs.writeFile("/etc/haproxy/haproxy.cfg", file, function (err) {
			    	if (err) {
			    		logger.error(err);
			    	}
			    	//done! restart HAProxy
			    	exec("sudo service haproxy reload", function (err, stdout, stderr) {
			    		if (stdout) {
			    			logger.debug(stdout);
			    		}
			    		if (stderr) {
			    			logger.error(stderr);
			    		}
			    	});
			    }); 

			}, function () {//HAPROXY_OFF is set to true. do nothing
			});
		}
	},
	requestCore: function (userId, body) {
		//store the userId and request info in the database. wait for this app to find it
		//also generate unique strings to append to the external IP address that will
		//be given to users. HAProxy will map those IPs to the correct internal IP addresses
		//of core and hmi
		//generate random letters and numbers for the user and hmi addresses
		//get all keys in the KV store and find their external address prefixes
		consuler.getKeyAll("manticore/requests/", function (results) {
			var addresses = core.getAddressesFromUserRequests(results);
			var options1 = {
				length: 12,
				charset: 'alphanumeric',
				capitalization: 'lowercase'
			}

			var func1 = randomString.generate.bind(undefined, options1);
			const userToHmiAddress = core.getUniqueString(addresses, func1); //userAddress prefix
			const hmiToCoreAddress = core.getUniqueString(addresses, func1); //hmiAddress prefix

			//since we must have one TCP port open per connection to SDL core (it's a long story)
			//generate a number within reasonable bounds and isn't already used by other core connections
			//WARNING: this does not actually check if the port is used on the OS! please make sure the
			//port range specified in the environment variables are all open!
			var usedPorts = core.getPortsFromUserRequests(results);
			const tcpPortExternal = core.getUniquePort(process.env.TCP_PORT_RANGE_START, 
				process.env.TCP_PORT_RANGE_END, usedPorts);
			body.userToHmiPrefix = userToHmiAddress;
			body.hmiToCorePrefix = hmiToCoreAddress;
			body.tcpPortExternal = tcpPortExternal;
			logger.debug("Store request " + userId);
			consuler.setKeyValue("manticore/requests/" + userId, JSON.stringify(body));
		});

	},
	//send back connection information in order for the client to make a websocket connection to
	//receive sdl_core logs
	requestLogs: function (userId, callback) {
		//point the user to the appropriate address
		var address = core.getWsUrl();
		//use the userId to generate a unique ID intended for the socket connection
		var connectionId = userId;
		logger.debug("Connection ID Generated:" + connectionId);
		//make sure there is an allocation for core intended for this user before 
		//starting up a connection
		nomader.getAllocations("core", nomadAddress, function (res) {
			//we know which allocation to find because the TaskGroup name has the client ID
			//make sure the allocation is alive, which indicates it's the one that's running core
			var allocation = core.findAliveCoreAllocation(res.allocations, userId);
			if (allocation === null) {
				//core isn't available to stream logs
				logger.debug("Core isn't available for streaming for connection ID " + userId);
				callback(null);
			}
			else {
				//we can stream logs! return the appropriate connection details
				//pass back the address and connectionID to connect to the websocket server
				var connectionInfo = {
					url: address,
					connectionId: connectionId
				}
				logger.debug("Sending connection information to user " + userId);
				logger.debug("Address: " + connectionInfo.url);
				logger.debug("Connection ID: " + connectionInfo.connectionId);
				callback(connectionInfo);
				var taskName; //get the task name
				for (var obj in allocation.TaskStates) {
					taskName = obj;
					break;
				}
				//start streaming logs to the client once they connect using the connection details
				var custom = io.of('/' + userId);
				custom.on('connection', function (socket) {
					logger.debug("User connected! Stream core logs");
					//get the stdout logs and stream them
					nomader.streamLogs(allocation.ID, taskName, "stdout", nomadAddress, function (data) {
						//this function gets invoked whenever new data arrives from core
						socket.emit("logs", data);
					});	
				});
			}

		});

	},
	deleteKey: function (key, callback) {
		consuler.delKey(key, function () {
			callback();
		});
	},
	deleteJob: function (jobName, callback) {
		nomader.deleteJob(jobName, nomadAddress, function () {
			callback();
		});
	}
}
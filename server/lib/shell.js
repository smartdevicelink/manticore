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
var C = require('./constants.js'); //location of constants such as strings
var AWS = require('aws-sdk');
var functionite = require('functionite');
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
		//add filler keys so we can detect changes to empty lists in the KV store
		functionite()
		.toss(consuler.setKeyValue, C.keys.fillers.request, "Keep me here please!")
		.toss(consuler.setKeyValue, C.keys.fillers.waiting, "Keep me here please!")
		.toss(consuler.setKeyValue, C.keys.fillers.claimed, "Keep me here please!")
		.toss(consuler.setKeyValue, C.keys.haproxy.mainPort, process.env.HAPROXY_HTTP_LISTEN)
		.toss(consuler.setKeyValue, C.keys.haproxy.domainName, process.env.DOMAIN_NAME)
		.toss(function () {
			callback();
		}).go();

	},
	startWatches: function (postUrl) {
		//set up watches for the KV store
		consuler.watchKVStore(C.keys.request, requestsWatch);
		consuler.watchKVStore(C.keys.waiting, waitingWatch);
		consuler.watchKVStore(C.keys.claimed, claimedWatch);
		//set up a watch for all services
		consuler.watchServices(serviceWatch);

		function requestsWatch (keys) {
			//if keys is undefined, set it to an empty array
			//get waiting list keys
			keys = keys || [];
			var waitingKV;
			//filter out filler key/value
			var requestKeys = core.transformKeys(keys, C.keys.data.request, true);
			functionite()
			.pass(consuler.getKeyAll, C.keys.waiting)
			.pass(functionite(core.transformKeys), C.keys.data.waiting, false)
			.pass(function (waitingKeys, callback) {
				waitingKV = waitingKeys;
				callback();
			})
			.pass(consuler.getKeyAll, C.keys.claimed)
			.pass(functionite(core.transformKeys), C.keys.data.claimed, false)
			.pass(function (claimedKV, callback) {
				logger.debug("KV store update (after transforming)");
				logger.debug("Requests");
				logger.debug(requestKeys);
				logger.debug("Waiting");
				logger.debug(waitingKV);
				logger.debug("Claimed");
				logger.debug(claimedKV);
				//var lock = consuler.lock(C.keys.waiting + "/"); //lock the directory
				//lock.on('acquire', function () {
					var updated = core.updateWaitingList(requestKeys, waitingKV, claimedKV);
					logger.debug("Updated waiting list:");
					logger.debug(updated);
					//delete everything in manticore/waiting/data and update it using the updated object generated
					consuler.delKeyAll(C.keys.data.waiting, function () {
						callback(updated); //pass updated to the next function
					});
				//});
				/*lock.on('error', function (err) {
					logger.debug(err);
				});
				lock.on('retry', function () {
					logger.debug("Trying to get lock again...");
				});
				lock.on('end', function () {
					logger.debug("done trying to get lock");
				});
				lock.acquire(); //attempt to get the lock*/
			})
			.pass(function (updated) {
				var count = 0; //find out number of keys in updated
				for (var key in updated) {
					count++;
				}
				//set all the updated keys and values in the store
				var expectingUpdate = core.expectation(count, function () {
					//lock.release(); //done
				});
				for (var key in updated) {
					logger.debug(key);
					logger.debug(updated[key]);
					consuler.setKeyValue(C.keys.data.waiting + "/" + key, ""+updated[key], function () {
						expectingUpdate.send();
					});
				}	
			}).go()
		}

		function waitingWatch (keys) {
			//waiting list updated
			//get the request with the lowest index (front of waiting list)
			//get information from requests, waiting AND claimed list. we need all of it
			var requestsKV;
			var claimedKV;
			var lowestKey;

			functionite()
			.pass(consuler.getKeyAll, C.keys.waiting)
			.pass(functionite(core.transformKeys), C.keys.data.waiting, false)
			.pass(function (waitingKV, callback) {
				core.findLowestIndexedKey(waitingKV, function (lowKey) {
					lowestKey = lowKey;
					logger.debug("LOWEST KEY");
					logger.debug(lowestKey);
					callback(); //a key has been found. continue onward
				});
			}) 
			.pass(consuler.getKeyAll, C.keys.request)
			.pass(functionite(core.transformKeys), C.keys.data.request, false)
			.pass(function (requestKeys, callback) {
				requestsKV = requestKeys;
				callback(); //populated requestsKV. continue
			})
			.pass(consuler.getKeyAll, C.keys.claimed)
			.pass(functionite(core.transformKeys), C.keys.data.claimed, false)
			.pass(function (claimedKeys, callback) {
				claimedKV = claimedKeys;
				//since we are testing if the user from the waiting list can be in claimed
				//we must also add that to claimedKV!
				claimedKV[lowestKey] = "";
				callback();
			})
			.pass(function () {
				//check if it is possible to run an additional core AND hmi
				//since we aren't ACTUALLY running core or hmi we can simply
				//add both new core and hmi tasks at once even though the hmi job depends on
				//information from a core task successfully allocated

				//make a job file
				var job = nomader.createJob("core");
				var filteredKeys = core.filterObjectKeys(requestsKV, claimedKV);
				for (var key in filteredKeys) {
					var request = JSON.parse(filteredKeys[key]);
					core.addCoreGroup(job, key, request);
				}
				//add an HMI to this job file. use any data
				core.addHmiGenericGroup(job, {
					Tags: ['{"userId":"12345","hmiToCorePrefix":"asdf1234"}'],
					Address: "127.0.0.1",
					Port: 3000
				}, process.env.HAPROXY_HTTP_LISTEN);
				//test submission!
				job.planJob(nomadAddress, "core", function (results) {
					if (results.FailedTGAllocs === null) { 
						//no suspectible errors in allocating this
						//remove id from waiting and add to claimed
						functionite()
						.pass(consuler.delKey, C.keys.data.waiting + "/" + lowestKey)
						.toss(consuler.setKeyValue, C.keys.data.claimed + "/" + lowestKey, "")
						.toss(function (){logger.debug("Dun")})
						.go();
					}
				});
			}).go();
		}

		function claimedWatch (keys) {
			//claimed list updated
			//submit the job file using the information from the requests list
			var requestKV;
			functionite()
			.pass(consuler.getKeyAll, C.keys.request)
			.pass(functionite(core.transformKeys), C.keys.data.request, false)
			.pass(function (requestKeys, callback) {
				requestKV = requestKeys;
				callback();
			})
			.pass(consuler.getKeyAll, C.keys.claimed)
			.pass(functionite(core.transformKeys), C.keys.data.claimed, false)
			.pass(function (claimedKV) {
				//filter out requestKeys based on the claimedKeys list
				//convert list to one that has a similar structure to 
				var filteredKeys = core.filterObjectKeys(requestKV, claimedKV);
				//make a job file
				var job = nomader.createJob("core");
				for (var key in filteredKeys) {
					var request = JSON.parse(filteredKeys[key]);
					core.addCoreGroup(job, key, request);
				}
				core.checkJobs(job, function () {//there are tasks. submit the job
					logger.debug("Core tasks exist");
					job.submitJob(nomadAddress, function (result) {
						logger.debug(result);
					});
				}, function () { //there are no tasks. delete the job
					logger.debug("No core tasks");
					self.deleteJob("core", function () {});
				});
			})
			.go();
		}

		/*function keysWatch (keys) {
			//if keys is undefined, set it to an empty array
			keys = keys || [];
			var requestKeys = core.transformKeys(keys, "manticore/requests/");
			var waitingKeys = core.transformKeys(keys, "manticore/waiting/");
			logger.debug("KV store update (after filtering)");
			logger.debug(requestKeys);

			//set up an expectation that we want the values of <keys.length> keys.
			//send a callback function about what to do once we get all the values
			var expecting = core.expect(requestKeys.length, function (job) {
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
			for (let i = 0; i < requestKeys.length; i++) {
				//go through each key and get their value. send the value to expecting
				//expecting will keep track of how many more keys are left
				consuler.getKeyValue(requestKeys[i], function (value) {
					expecting.send(requestKeys[i], value);
				});
			}		
		}*/

		function serviceWatch (services) {
			logger.debug("Services update");
			//services updated. get information about core and hmi if possible
			let cores = services.filter("core-master");
			let hmis = services.filter("hmi-master");
			let manticores = services.filter("manticore-service");

			logger.debug("Core services: " + cores.length);
			logger.debug("Hmi services: " + hmis.length);
			logger.debug("Manticore services: " + manticores.length);
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
				self.deleteKey(C.keys.request + "/" + userId, function () {});
			});
			pairs = {
				pairs: pairs
			};
			//post all pairs at once
			logger.info(pairs);
			//currently doesn't really do anything
			needle.post(postUrl, pairs, function (err, res) {
			});

			//if HAPROXY_OFF was not set to "true"
			core.checkHaProxyFlag(function () {
				logger.debug("Updating KV Store with data for proxy!");
				var template = core.generateProxyData(pairs, manticores);
				//use the HAProxyTemplate file to submit information to the KV store so that
				//use the pairs because that has information about what addresses to use
				//consul-template can use that information to generate an HAProxy configuration
				//replace existing data in the KV store
				//WARNING: THIS COULD BE DANGEROUS. possibly use consul locks to limit redundancy of writes
				consuler.delKeyAll(C.keys.haproxy, function () {
					//make the async calls. store all data from the template inside haproxy/data/
					for (let i = 0; i < template.webAppAddresses.length; i++) {
						var item = template.webAppAddresses[i];
						(function (index) {
							consuler.setKeyValue(C.keys.haproxy.webapp + "/" + index, item, function (){});
						})(i);
					}	
					for (let i = 0; i < template.tcpMaps.length; i++) {
						var item = template.tcpMaps[i];
						(function (index){
							consuler.setKeyValue(C.keys.haproxy.tcpMaps + "/" + item.port, item.to, function (){});
						})(i);
					}	
					for (let i = 0; i < template.httpMaps.length; i++) {
						var item = template.httpMaps[i];
						(function (index) {
							consuler.setKeyValue(C.keys.haproxy.httpFront + "/" + index, item.from, function (){});
							consuler.setKeyValue(C.keys.haproxy.httpBack + "/" + index, item.to, function (){});
						})(i);
					}				
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
		consuler.getKeyAll(C.keys.request + "/", function (results) {
			//do not store a new request in the KV store if the request already exists
			//pass in the prefix to the value we want to check exists
			core.checkUniqueRequest(C.keys.request + "/" + userId, results, function () {
				//if HAPROXY_OFF is set to true then the external addresses mean nothing
				//don't bother computing what they should be
				core.checkHaProxyFlag(function () { //HAPROXY on
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
					consuler.setKeyValue(C.keys.data.request + "/" + userId, JSON.stringify(body));
					
				}, function () { //HAPROXY off
					logger.debug("Store request " + userId);
					consuler.setKeyValue(C.keys.data.request + "/" + userId, JSON.stringify(body));
				});

			});

		});

	},
	//send back connection information in order for the client to make a websocket connection to
	//receive sdl_core logs
	requestLogs: function (userId, callback) {
		//make sure there is an allocation for core intended for this user before 
		//starting up a connection
		nomader.getAllocations("core", nomadAddress, function (res) {
			//we know which allocation to find because the TaskGroup name has the client ID
			//make sure the allocation is alive, which indicates it's the one that's running core
			var allocation = core.findAliveCoreAllocation(res.allocations, userId);
			var connectionInfo = core.handleAllocation(allocation, userId, function (taskName) {
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
			});
			callback(connectionInfo); //get back connection info and pass it to client
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
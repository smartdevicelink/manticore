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
var WaitingList = require('./WaitingList.js'); //represents the waiting list in the KV store
var UserRequest = require('./UserRequest.js'); //represents the nature of a user's request
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
		//set up a watch for all services
		consuler.watchServices(serviceWatch);

		function requestsWatch (requestKeyArray) {
			logger.debug("request watch hit");
			//trim the prefixes of the requestKeyArray
			for (let i = 0; i < requestKeyArray.length; i++) {
				requestKeyArray[i] = requestKeyArray[i].split(C.keys.data.request + "/")[1];
			}
			//get waiting key and value
			functionite()
			.pass(consuler.getKeyValue, C.keys.data.waiting)
			.pass(function (waitingValue) {
				var waitingHash = WaitingList(waitingValue);
				waitingHash.update(requestKeyArray);
				logger.debug("Waiting list update");
				logger.debug(waitingHash.get());
				//update manticore/waiting/data using the updated object generated
				consuler.setKeyValue(C.keys.data.waiting, waitingHash.get(), function () {});
			})
			.go()
		}

		function waitingWatch () {
			logger.debug("waiting watch hit");
			//waiting list updated
			//get the request with the lowest index (front of waiting list)

			var requestKV;
			//get request keys and values
			functionite()
			.pass(consuler.getKeyAll, C.keys.request)
			.pass(functionite(core.transformKeys), C.keys.data.request)
			.pass(function (requestKeys, callback) {
				//store requestKeys for future use
				requestKV = requestKeys;
				callback();
			})
			.toss(consuler.getKeyValue, C.keys.data.waiting)
			.pass(function (waitingObj, callback) {
				waitingHash = WaitingList(waitingObj);
				logger.debug("Find next in waiting list");
				
				waitingHash.nextInQueue(function (lowestKey) {
					//there is a request that needs to claim a core
					logger.debug("Lowest key found:");
					logger.debug(lowestKey);
					attemptCoreAllocation(lowestKey, waitingHash);
				}, function () {
					//there are no more requests that could claim a core
					//submit updated core job
					logger.debug("No more unclaimed in waiting list");
					//set up a job file for cores to actually run
					var coreJob = createCoreJob(waitingHash, requestKV);
					updateJobs(coreJob, "core");
				});				
			})
			.go();

			function attemptCoreAllocation (lowestKey, waitingHash) {
				//since we are testing if the user from the waiting list can claim core/hmi
				//we must include that information for this test!
				waitingHash.setClaimed(lowestKey, true);
				//check if it is possible to run an additional core AND hmi
				//since we aren't ACTUALLY running core or hmi we can simply
				//add both new core and hmi tasks at once even though the hmi job depends on
				//information from a core task successfully allocated

				//only include requests that have claimed a core/hmi or are attempting to claim one
				var job = nomader.createJob("cores-and-hmis");
				var filteredRequests = waitingHash.filterRequests(requestKV);
				logger.debug("filtered requests");
				logger.debug(filteredRequests);

				for (var key in filteredRequests) {
					var request = UserRequest().parse(filteredRequests[key]);
					core.addCoreGroup(job, key, request);
					//add an HMI to this test job file
					core.addHmiGenericGroup(job, {
						Tags: [`{"id":"${key}","hmiToCorePrefix":"asdf1234","brokerAddressPrefix":"asdf2345"}`],
						Address: "127.0.0.1",
						Port: 3000
					}, process.env.HAPROXY_HTTP_LISTEN);
				}

				//test submission!
				job.planJob(nomadAddress, "cores-and-hmis", function (results) {
					core.checkHasResources(results, function () {
						logger.debug("Core and HMI can be allocated!");
						//now update the waiting list! 
						consuler.setKeyValue(C.keys.data.waiting, waitingHash.get(), function (){});
					}, function () {
						//error: insufficient resources. update the job
						logger.debug("Core and HMI cannot be allocated!");
						//set next request in waiting list's claimed back to false and submit the job
						waitingHash.setClaimed(lowestKey, false);
						var coreJob = createCoreJob(waitingHash, requestKV);
						updateJobs(coreJob, "core");
					});
				});
			}
		}
/*
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
				var lock = consuler.lock(C.keys.waiting + "/"); //lock the directory
				lock.on('acquire', function () {
					var updated = core.updateWaitingClaimedList(requestKeys, waitingKV, claimedKV);
					logger.debug("Updated waiting list:");
					logger.debug(updated);
					//delete everything in manticore/waiting/data and update it using the updated object generated
					consuler.delKeyAll(C.keys.data.waiting, function () {
						callback(updated); //pass updated to the next function
					});
				});
				lock.on('error', function (err) {
					logger.debug(err);
				});
				lock.on('retry', function () {
					logger.debug("Trying to get lock again...");
				});
				lock.on('end', function () {
					logger.debug("done trying to get lock");
				});
				lock.acquire(); //attempt to get the lock
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
					consuler.setKeyValue(C.keys.data.waiting + "/" + key, ""+updated[key], function () {
						expectingUpdate.send();
					});
				}	
			}).go()
		}

*/
		function serviceWatch (services) {
			logger.debug("Services update");
			//services updated. get information about core and hmi if possible
			let cores = services.filter("core-master");
			let hmis = services.filter("hmi-master");
			let manticores = services.filter("manticore-service");
			
			logger.error(JSON.stringify(services, null, 2));
			logger.error(JSON.stringify(cores, null, 2));
			logger.error(JSON.stringify(hmis, null, 2));
			logger.error(JSON.stringify(manticores, null, 2));

			logger.debug("Core services: " + cores.length);
			logger.debug("Hmi services: " + hmis.length);
			logger.debug("Manticore services: " + manticores.length);
			//for every core service, ensure it has a corresponding HMI
			var job = nomader.createJob("hmi");
			core.addHmisToJob(job, cores);
			//submit the job. if there are no task groups then
			//we want to remove the job completely. delete the job in that case
			updateJobs(job, "hmi");

			var pairs = core.findPairs(cores, hmis, function (id) {
				//remove user from KV store because the HMI has no paired core which
				//indicates that the user exited the HMI page and is done with their instance
				self.deleteKey(C.keys.data.request + "/" + id, function () {});
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
				//TODO: use atomic operations to submit all this at once
				consuler.delKeyAll(C.keys.data.haproxy, function () {
					//make the async calls. store all data from the template inside haproxy/data/
					for (let i = 0; i < template.webAppAddresses.length; i++) {
						var item = template.webAppAddresses[i];
						(function (index) {
							consuler.setKeyValue(C.keys.haproxy.webApp + "/" + index, item, function (){});
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
	requestCore: function (id, body) {
		//id = Math.floor(Math.random()*1000);
		//body.id = id;
		//store the id and request info in the database. wait for this app to find it
		//also generate unique strings to append to the external IP address that will
		//be given to users. HAProxy will map those IPs to the correct internal IP addresses
		//of core and hmi
		//generate random letters and numbers for the user and hmi addresses
		//get all keys in the KV store and find their external address prefixes
		//do not get the filler key/value!
		var requestJSON = UserRequest(body);
		consuler.getKeyAll(C.keys.data.request + "/", function (results) {
			//do not store a new request in the KV store if the request already exists
			//pass in the prefix to the value we want to check exists
			core.checkUniqueRequest(C.keys.data.request + "/" + id, results, function () {
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
					const brokerAddress = core.getUniqueString(addresses, func1); //brokerAddress prefix

					//since we must have one TCP port open per connection to SDL core (it's a long story)
					//generate a number within reasonable bounds and isn't already used by other core connections
					//WARNING: this does not actually check if the port is used on the OS! please make sure the
					//port range specified in the environment variables are all open!
					var usedPorts = core.getTcpPortsFromUserRequests(results);
					const tcpPortExternal = core.getUniquePort(process.env.TCP_PORT_RANGE_START, 
						process.env.TCP_PORT_RANGE_END, usedPorts);
					
					requestJSON.userToHmiPrefix = userToHmiAddress;
					requestJSON.hmiToCorePrefix = hmiToCoreAddress;
					requestJSON.tcpPortExternal = tcpPortExternal;
					requestJSON.brokerAddressPrefix = brokerAddress;

					logger.debug("Store request " + id);
					consuler.setKeyValue(C.keys.data.request + "/" + id, requestJSON.getString());
					
				}, function () { //HAPROXY off
					logger.debug("Store request " + id);
					consuler.setKeyValue(C.keys.data.request + "/" + id, requestJSON.getString());
				});

			});

		});

	},
	//send back connection information in order for the client to make a websocket connection to
	//receive sdl_core logs
	requestLogs: function (id, callback) {
		//make sure there is an allocation for core intended for this user before 
		//starting up a connection
		//the log request requires that the address must be from the client from which the allocation
		//was placed. make sure this address is used on the streamLogs function!
		nomader.getAllocations("core", nomadAddress, function (res) {
			//we know which allocation to find because the TaskGroup name has the client ID
			//make sure the allocation is alive, which indicates it's the one that's running core
			var allocation = core.findAliveCoreAllocation(res.allocations, id);
			//get the client agent address using its node ID
			var connectionInfo = core.handleAllocation(allocation, id, function (taskName) {
				var nodeID = allocation.NodeID;
				nomader.getNodeStatus(nodeID, nomadAddress, function (data) {
					var targetedNomadAddress = data.HTTPAddr;
					logger.error("Client agent address found:");
					logger.error(targetedNomadAddress);
					//start streaming logs to the client once they connect using the connection details
					var custom = io.of('/' + id);
					custom.on('connection', function (socket) {
						logger.debug("User connected! Stream core logs");
						//get the stdout logs and stream them
						nomader.streamLogs(allocation.ID, taskName, "stdout", targetedNomadAddress, function (data) {
							//this function gets invoked whenever new data arrives from core
							socket.emit("logs", data);
						});	
					});
					callback(connectionInfo); //get back connection info and pass it to client
				});
			});
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

function createCoreJob (waitingHash, requestKV) {
	var coreJob = nomader.createJob("core");
	//filter requests out so only the ones in the waiting list that have claimed a core are returned
	var filteredRequests = waitingHash.filterRequests(requestKV);
	logger.debug("filtered requests");
	logger.debug(filteredRequests);

	for (var key in filteredRequests) {
		var request = UserRequest().parse(filteredRequests[key]);
		core.addCoreGroup(coreJob, key, request);
	}
	return coreJob;
}

function updateJobs (localJob, jobName, jobModifyIndex) {
	logger.error(jobName);
	logger.error(JSON.stringify(localJob, null, 2));
	//only submit the job if any information has changed
	nomader.findJob(jobName, nomadAddress, function (job) {
		logger.debug("CHECKING CONTENTS FOR " + jobName);
		var changed = core.compareJobStates(localJob, job);
		if (!changed) {
			logger.debug("Job files are the same!");
		}
		else {
			logger.debug("Job files are different!");
			//attempt to submit the updated job
			/*core.checkJobs(localJob, function () {//there are tasks. submit the job
				logger.debug(jobName + " tasks exist");
				logger.debug(localJob.getJob().Job.TaskGroups.length);
				localJob.submitJob(nomadAddress, function (result) {
					logger.debug(result);
				});
			}, function () { //there are no tasks. delete the job
				logger.debug("No " + jobName + " tasks");
				self.deleteJob(jobName, function () {});
			});*/
		}
	});
}
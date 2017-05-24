var functionite = require('functionite');
var core = require('./core.js');
//SUBFOLDER MODULES
var jobLogic = require('./job/shell.js');
var proxyLogic = require('./proxy/shell.js');
var resourceLogic = require('./resource/shell.js');

//watches that are handled by this module
var serviceWatches = {};

/** @module app/watches/shell */

module.exports = {
	/**
	* Sets up watches for Consul's KV store in the request, waiting, and allocation list
	* @param {Context} context - Context instance
	*/
	startKvWatch: function (context) {
		//set up watches for the KV store
		//pass in the context to the watch functions
		context.consuler.watchKVStore(context.keys.request, requestsWatch(context));
		context.consuler.watchKVStore(context.keys.waiting, waitingWatch(context)); 
		context.consuler.watchKVStore(context.keys.allocation, allocationWatch(context));
		//also setup the listener for the timeout event to listen to events
		//from the socket handler
		context.timeoutEvent.on('removeUser', function (id) {
			removeUser(context, id);
		});
	},
	/**
	* Sets up watches for Consul's services for core, hmi, and manticore services
	* @param {Context} context - Context instance
	*/
	startServiceWatch: function (context) {
		//first, consistently watch all the manticore services!
		context.consuler.watchServiceStatus(context.strings.manticoreServiceName, manticoreWatch(context));

		//set up a watch for all services
		var watch = context.consuler.watchAllServices(function (services) {
			var currentWatchesArray = Object.keys(serviceWatches);
			context.logger.debug("watches list");
			context.logger.debug(currentWatchesArray);
			var serviceArray = Object.keys(services);
			//only get core services and hmi services
			var coresAndHmis = serviceArray.filter(function (element) {
				return element.startsWith(context.strings.coreServicePrefix) || element.startsWith(context.strings.hmiServicePrefix);
			});

			core.updateWatches(currentWatchesArray, coresAndHmis, stopper, starter);

			function stopper (serviceName) {
				//this service doesn't exist anymore. stop the watch
				serviceWatches[serviceName].end();
				delete serviceWatches[serviceName];
			}
			function starter (serviceName) {
				//this service exists with no watch. start it
				var functionCallback;
				//extract userID for future reference
				if (serviceName.startsWith(context.strings.coreServicePrefix)) {
					var userId = serviceName.split(context.strings.coreServicePrefix)[1];
					functionCallback = coreWatch(context, userId);
				}
				if (serviceName.startsWith(context.strings.hmiServicePrefix)) {
					var userId = serviceName.split(context.strings.hmiServicePrefix)[1];
					functionCallback = hmiWatch(context, userId);
				}
				//start the watch!
				var watch = context.consuler.watchServiceStatus(serviceName, functionCallback);
				serviceWatches[serviceName] = watch;
			}
		});
	},
	removeUser: removeUser
}

/**
* Removes a user from the KV store request list
* @param {Context} context - Context instance
* @param {string} userId - ID of a user
*/
function removeUser (context, userId) {
	//if we have CloudWatch enabled, report the amount of time this user was using Manticore
	//the start time is when the user enters the waiting list, basically
	if (context.config.aws && context.config.aws.cloudWatch) {
		context.consuler.getKeyValue(context.keys.data.request + "/" + userId, function (result) {
			if (result) {
				var request = context.UserRequest().parse(result.Value);
				//find the total amount of time being in the request list in seconds
				var startTime = new Date(request.startTime);
				var endTime = new Date();
				var durationInSeconds = (endTime - startTime) / 1000;
				context.logger.debug("ID: " +userId + ", Duration: " + durationInSeconds);
				//now remove the user from the request list and publish the metric
				context.AwsHandler.publish(context.strings.userDuration, "Seconds", durationInSeconds);
				context.consuler.delKey(context.keys.data.request + "/" + userId, function () {});
			}
		});
	}
	else {
		//CloudWatch not enabled. simply delete the key
		context.consuler.delKey(context.keys.data.request + "/" + userId, function () {});
	}
	
}

//wrap the context in these functions so we have necessary functionality
//warning: releasing locks triggers an update for the KV store
/**
* The watch invoked when a change is found in the request list
* @param {Context} context - Context instance
*/
function requestsWatch (context) {
	return function (requestKeyArray) { //given from Consul
		context.logger.debug("request watch hit");
		//trim the prefixes of the requestKeyArray so we just get the inner-most key names
		for (let i = 0; i < requestKeyArray.length; i++) {
			requestKeyArray[i] = requestKeyArray[i].split(context.keys.data.request + "/")[1];
		}
		//the filler value will always be an element of this request list. therefore, the length
		//of this array minus 1 is the current number of requests
		context.AwsHandler.publish(context.strings.requestCount, "Count", requestKeyArray.length - 1);

		//get waiting key and value
		functionite()
		.pass(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingValue) {
			var waitingHash = context.WaitingList(waitingValue);
			//use the updated request list to remove any connection sockets that have info about a user
			waitingHash.update(requestKeyArray, function (lostKey) {
				//key not found. remove the allocation information
				//from the KV store. stop the job if it also exists
				//this function should be the ONLY authority on whether to delete the job
				//any other function that wants to stop a job should remove the key from the KV store instead
				waitingHash.remove(lostKey);
				context.consuler.delKey(context.keys.data.allocation + "/" + lostKey, function (){});
				context.nomader.deleteJob(context.strings.coreHmiJobPrefix + lostKey, context.nomadAddress, function (){});
			});

			context.socketHandler.cleanSockets(requestKeyArray);
			context.logger.debug("Waiting list update");
			context.logger.debug(waitingHash.get());
			//update manticore/waiting/data using the updated object generated
			context.consuler.setKeyValue(context.keys.data.waiting, waitingHash.get(), function () {});
		})
		.go()
	}
}

/**
* The watch invoked when a change is found in the waiting list
* @param {Context} context - Context instance
*/
function waitingWatch (context) {
	return function () {
		context.logger.debug("waiting watch hit");
		//get waiting list. the waiting list is one value as a stringified JSON
		context.consuler.getSetCheck(context.keys.data.waiting, function (waitingObj, setter, callback) {
			var waitingHash = context.WaitingList(waitingObj);
			//recalculate the positions of the new waiting list and send that over websockets
			var positionMap = waitingHash.getQueuePositions();
			//store and submit the position information of each user by their id
			for (var id in positionMap) {
				context.socketHandler.updatePosition(id, positionMap[id]);
			}

			var pendingKey = waitingHash.checkPending();
			if (pendingKey) { //user is in the "pending" state
				//don't do any waiting list logic other than determining the status of 
				//core and hmi allocations for a user
				context.logger.debug("found pending user " + pendingKey);
				jobLogic.waitForAllocations(context, pendingKey, function (success) {
					if (success) {
						context.logger.debug("allocation success " + pendingKey);
						//set the user's ID to claimed and update the waiting list
						waitingHash.setClaimed(pendingKey);
						setter(waitingHash.get(), function (res) {
							context.logger.debug(pendingKey + " set to claimed: " + res);
						});
					}
					else {
						//it's important to find out what happened if an allocation failed!
						//publish resource statistics
						//resourceLogic.getStats(context);

						context.logger.debug("allocation failed. set to waiting " + pendingKey);
						//set the user's ID to waiting and update the waiting list
						waitingHash.setWaiting(pendingKey);
						setter(waitingHash.get(), function (res) {
							context.logger.debug(pendingKey + " set to waiting (failed job): " + res);
						});						
					}
				});
			}
			else { //all users are in the "waiting" or "claimed" state
				//plan a job submission for the next user in the waiting list
				//to determine if there are enough resources available
				context.logger.debug("find next in waiting list");
				var lowestKey = waitingHash.nextInQueue();
				jobLogic.testAllocation(lowestKey, waitingHash, context, function (job) {
					if (job) { //resources available!
						//set the user to pending, assuming noone else has already set it
						waitingHash.setPending(lowestKey);
						setter(waitingHash.get(), function (res) {
							context.logger.debug(lowestKey + " set to pending: " + res);
							//submit the job!	
							var jobName = context.strings.coreHmiJobPrefix + lowestKey;
							jobLogic.submitJob(context, job, context.strings.coreGroupPrefix + lowestKey, function () {});
						});	
					}
				});				
			}
		});
	}
}

/**
* The watch invoked when a change is found in the allocation list
* @param {Context} context - Context instance
*/
function allocationWatch (context) {
	return function () {
		context.logger.debug("allocation watch hit");
		var requestsKV;
		//get allocation keys and values and request keys and values
		functionite()
		.pass(context.consuler.getKeyAll, context.keys.request)
		.pass(functionite(core.transformKeys), context.keys.data.request)
		.pass(function (requestKeys, callback) {
			//store requestKeys for future use
			requestsKV = requestKeys;
			callback();
		})
		.pass(context.consuler.getKeyAll, context.keys.allocation)
		.pass(functionite(core.transformKeys), context.keys.data.allocation)
		.pass(function (allocationKeys, callback) {
			//each key has a value that is stringified JSON in the format of the AllocationData class
			//go through each property found (key is the id of the user)
			//we also need information from the requests KV in order to complete this information

			var pairs = [];
			for (var key in allocationKeys) {
				var userId = key;
				var allocData = context.AllocationData().parse(allocationKeys[userId]); //convert the string into JSON
				//get the corresponding request KV object
				var kv = requestsKV[userId];
				//it's possible that in the time this function ran that some requests KVs got removed
				//from the store, making allocationKeys out of date. simply ignore the results that
				//are undefined since they don't exist anymore
				if (kv) {
					var requestObj = context.UserRequest().parse(kv);
					var pair = {
						id: userId,
						userAddressInternal: allocData.hmiAddress + ":" + allocData.hmiPort,
						hmiAddressInternal: allocData.coreAddress + ":" + allocData.corePort,
						tcpAddressInternal: allocData.coreAddress + ":" + allocData.tcpPort,
						brokerAddressInternal: allocData.hmiAddress + ":" + allocData.brokerPort,
						userAddressExternal: requestObj.userToHmiPrefix,
						hmiAddressExternal: requestObj.hmiToCorePrefix,
						tcpPortExternal: requestObj.tcpPortExternal,
						brokerAddressExternal: requestObj.brokerAddressPrefix
					}
					//pair information!
					//post/store the connection information to the client whose id matches
					//format the connection information and send it!

					var domainName;
					var httpListen;
					var sslPort;
					if (context.config.haproxy) {
						domainName = context.config.haproxy.domainName;
						httpListen = context.config.haproxy.httpListen;
						if (context.config.aws && context.config.aws.elb) {
							sslPort = context.config.aws.elb.sslPort;
						}
					}
					//send address information to the client(s)
					context.socketHandler.updateAddresses(context, pair.id, 
						core.formatPairResponse(pair, domainName, httpListen, sslPort));						

					//done.
					pairs.push(pair);
				}
			}
			context.logger.debug("current pairs:");
			context.logger.debug(pairs);
			context.AwsHandler.publish(context.strings.allocationCount, "Count", pairs.length);
			//publish resource statistics
			//resourceLogic.getStats(context);
			
			if (context.config.haproxy) {
				//update the proxy information using the proxy module (not manticore addresses!)
				context.logger.debug("Updating KV Store with address and port data for proxy!");
				var template = proxyLogic.generateProxyData(context, pairs, []);
				proxyLogic.updateCoreHmiKvStore(context, template);

				//furthermore, if ELB is enabled, use the TCP port information
				//from the template to modify the ELB such that it is listening and routing
				//on those same ports
				if (context.config.aws && context.config.aws.elb) {
					context.AwsHandler.changeState(template);
				}
			}
		})
		.go();
	}
}

/**
* The watch invoked when a change is found in core services
* @param {Context} context - Context instance
* @param {string} userId - ID of a user
*/
function coreWatch (context, userId) {
	return function (services) {
		//should just be one core per job
		var coreServices = core.filterServices(services, []);
		context.logger.debug("Core service: " + userId + " " + coreServices.length);
		if (coreServices.length > 0) {
			var coreService = coreServices[0];
			var jobName = context.strings.coreHmiJobPrefix + userId;
			//due to bugs with Consul, we need to make a check with Nomad
			//to make sure that this service has a corresponding job.
			//if it's a rogue service, ignore it, as it likely cannot be removed in any elegant way
			context.nomader.findJob(jobName, context.nomadAddress, function (job) {
				//use the job that was submitted to append an hmi group and resubmit it
				if (job && !checkJobForHmi(job, context.strings.hmiGroupPrefix)) { //job exists for this service and doesn't have an HMI. add an hmi and submit
					//get the request object stored for this user id
					context.consuler.getKeyValue(context.keys.data.request + "/" + userId, function (result) {
						if (result) {
							//we need one more piece of info, and that's the location of sdl_core's file port.
							//unfortunately, we will need to make an allocation call to Nomad to find this info
							var coreAllocID = coreService.ID.match(/[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+/g)[0];
							context.nomader.getAllocation(coreAllocID, context.nomadAddress, function (allocationResult) {
								var filePort;
								if (allocationResult.Resources.Networks[0].DynamicPorts[0].Label === "file") {
									filePort = allocationResult.Resources.Networks[0].DynamicPorts[0].Value;
								}
								else if (allocationResult.Resources.Networks[0].DynamicPorts[1].Label === "file") {
									filePort = allocationResult.Resources.Networks[0].DynamicPorts[1].Value;
								}
								else {
									filePort = allocationResult.Resources.Networks[0].DynamicPorts[2].Value;
								}
								var requestObj = context.UserRequest().parse(result.Value);
								//add the hmi group and submit the job
								jobLogic.addHmiGenericGroup(context, job, coreService, requestObj, context.strings, filePort);
								jobLogic.submitJob(context, job, context.strings.hmiGroupPrefix + userId, function () {});	
							});						
						}
					});
				}
			});
		}
		else { //core for this user id has died?
			//context.logger.debug("Core died. Delete job " + userId);
			//removeUser(context, userId);
		}
	}
}

/**
* The watch invoked when a change is found in hmi services
* @param {Context} context - Context instance
* @param {string} userId - ID of a user
*/
function hmiWatch (context, userId) {
	return function (services) {
		//require an http alive check. should only be one hmi service
		var hmiServices = core.filterServices(services, [context.strings.hmiAliveHealth]);
		context.logger.debug("Hmi service: " + userId + " " + hmiServices.length);
		//if this returns 0 services then its probably because the health check failed.
		//don't do anything rash
		if (hmiServices.length > 0) {
			var hmiService = hmiServices[0];
			var jobName = context.strings.coreHmiJobPrefix + userId;
			//should just be one hmi per job
			//due to bugs with Consul, we need to make a check with Nomad
			//to make sure that this service has a corresponding job.
			//if it's a rogue service, ignore it, as it likely cannot be removed in any elegant way
			context.nomader.findJob(jobName, context.nomadAddress, function (job) {
				if (job) { //job exists for this service
					//make sure this connection information doesn't already exist in the allocation store!
					//we want to reduce writes to the KV store to save networking and cpu resources
					context.consuler.getKeyValue(context.keys.data.allocation + "/" + userId, function (result) {
						if (result) {
							//info has already been grabbed!
						}
						else {
							getConnectionInformation(job, hmiService, function (data) {
								//take all the information we got and store it in the KV under allocations for the user
								context.consuler.setKeyValue(context.keys.data.allocation + "/" + userId, JSON.stringify(data), function () {});
							});							
						}
					});
				}
			});
		}

		function getConnectionInformation (job, hmiService, callback) {
			//we need three things. the ID, the request data from the KV store,
			//and the allocation details of this core task
			//this regex will find the allocation ID within the ID of this service
			var hmiAllocID = hmiService.ID.match(/[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+/g)[0];
			//store important information here
			var data = context.AllocationData({
 				userPort: null,
 				brokerPort: null,
				tcpPort: null,
 				coreAddress: null,
 				corePort: null,
 				hmiAddress: hmiService.Address,
 				hmiPort: hmiService.Port
 			});

			functionite() //get the allocation info
			.pass(context.nomader.getAllocation, hmiAllocID, context.nomadAddress)
			.pass(function (allocationResult, callback) {
				//figure out where the user and broker port data is in the 2-element array
				if (allocationResult.Resources.Networks[0].DynamicPorts[0].Label === "user") {
					data.userPort = allocationResult.Resources.Networks[0].DynamicPorts[0].Value;
					data.brokerPort = allocationResult.Resources.Networks[0].DynamicPorts[1].Value;
				}
				else {
					data.userPort = allocationResult.Resources.Networks[0].DynamicPorts[1].Value;
					data.brokerPort = allocationResult.Resources.Networks[0].DynamicPorts[0].Value;
				}
				callback();
			})//get the core service for this id
			.toss(context.consuler.getService, context.strings.coreServicePrefix + userId)
			.pass(function (coreServices, callback) {
				if (coreServices.length > 0) {
					var coreAllocID = coreServices[0].Service.ID.match(/[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+/g)[0];
					//while we are getting the core service, retrieve the core address and port to be used later
					data.coreAddress = coreServices[0].Service.Address;
					data.corePort = coreServices[0].Service.Port;
					callback(coreAllocID, context.nomadAddress);
				}
				else { //in this case, the HMI is still running but core isn't. we have to stop the job now
					context.logger.debug("Core died. Delete job " + userId);
					removeUser(context, userId);
				}

			}) //get the allocation info
			.pass(context.nomader.getAllocation)
			.pass(function (allocationResult) {
				if (allocationResult.Resources.Networks[0].DynamicPorts[0].Label === "tcp") {
					data.tcpPort = allocationResult.Resources.Networks[0].DynamicPorts[0].Value;
				}
				else if (allocationResult.Resources.Networks[0].DynamicPorts[1].Label === "tcp") {
					data.tcpPort = allocationResult.Resources.Networks[0].DynamicPorts[1].Value;
				}
				else {
					data.tcpPort = allocationResult.Resources.Networks[0].DynamicPorts[2].Value;
				}
				callback(data); //done
			})
			.go();
		}
	}
}


/**
* The watch invoked when a change is found in manticore services
* @param {Context} context - Context instance
*/
function manticoreWatch (context) {
	return function (services) {
		var manticores = core.filterServices(services, [context.strings.manticoreAliveHealth]); //require an http alive check
		context.logger.debug("Manticore services: " + manticores.length);
		//ONLY update the manticore services in the KV store, and only if haproxy is enabled
		if (context.config.haproxy) {
			context.logger.debug("Updating KV Store with manticore data for proxy!");
			var template = proxyLogic.generateProxyData(context, [], manticores);
			proxyLogic.updateManticoreKvStore(context, template);
		}
	}
}

/**
* Finds whether this job has an HMI in it
* @param {object} job - Object of the job file intended for submission to Nomad
* @param {string} prefix - The prefix to check the task group name against
* @returns {boolean} - Shows whether an HMI exists in the job file
*/
function checkJobForHmi (job, prefix) {
	var taskGroupCount = job.getJob().Job.TaskGroups.length;
	var foundHMI = false;
	for (let i = 0; i < taskGroupCount; i++) {
		if (job.getJob().Job.TaskGroups[i].Name.startsWith(prefix)) {
			foundHMI = true;
			break;
		}
	}
	return foundHMI;
}
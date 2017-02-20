var functionite = require('functionite');
var core = require('./core.js');
//SUBFOLDER MODULES
var jobLogic = require('./job/shell.js');
var proxyLogic = require('./proxy/shell.js');

//watches that are handled by this module
var serviceWatches = {};

module.exports = {
	startKvWatch: function (context) {
		//set up watches for the KV store
		//pass in the context to the watch functions
		context.consuler.watchKVStore(context.keys.request, requestsWatch(context));
		context.consuler.watchKVStore(context.keys.waiting, waitingWatch(context));
		context.consuler.watchKVStore(context.keys.allocation, allocationWatch(context));
	},
	startServiceWatch: function (context) {
		//set up a watch for all services
		var watch = context.consuler.watchAllServices(function (services) {
			var currentWatchesArray = Object.keys(serviceWatches);
			var serviceArray = Object.keys(services);
			//only get core services and hmi services
			var coresAndHmis = serviceArray.filter(function (element) {
				return element.startsWith("core-service") || element.startsWith("hmi-service");
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
				if (serviceName.startsWith("core-service")) {
					functionCallback = coreWatch(context);
				}
				if (serviceName.startsWith("hmi-service")) {
					functionCallback = hmiWatch(context);
				}
				//start the watch!
				var watch = context.consuler.watchServiceStatus(serviceName, functionCallback);
				serviceWatches[serviceName] = watch;
			}
			//only get manticore services
			var manticores = serviceArray.filter(function (element) {
				return element === "manticore-service";
			});

		});
	}
}

//wrap the context in these functions so we have necessary functionality
//warning: releasing locks triggers an update for the KV store

//request list update
function requestsWatch (context) {
	return function (requestKeyArray) { //given from Consul
		context.logger.debug("request watch hit");
		//trim the prefixes of the requestKeyArray so we just get the inner-most key names
		for (let i = 0; i < requestKeyArray.length; i++) {
			requestKeyArray[i] = requestKeyArray[i].split(context.keys.data.request + "/")[1];
		}
		//get waiting key and value
		functionite()
		.pass(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingValue) {
			var waitingHash = context.WaitingList(waitingValue);
			waitingHash.update(requestKeyArray);
			//use the updated request list to remove any connection sockets that have info about a user
			//TODO: REMOVE STUFF FROM ALLOCATION STORE AS WELL
			context.socketHandler.cleanSockets(requestKeyArray);
			context.logger.debug("Waiting list update");
			context.logger.debug(waitingHash.get());
			//update manticore/waiting/data using the updated object generated
			context.consuler.setKeyValue(context.keys.data.waiting, waitingHash.get(), function () {});
		})
		.go()
	}
}

//waiting list update
function waitingWatch (context) {
	return function () {
		context.logger.debug("waiting watch hit");
		var requestKV;
		//get request keys and values
		functionite()
		.pass(context.consuler.getKeyAll, context.keys.request)
		.pass(functionite(core.transformKeys), context.keys.data.request)
		.pass(function (requestKeys, callback) {
			//store requestKeys for future use
			requestKV = requestKeys;
			callback();
		})
		//get waiting list. the waiting list is one value as a stringified JSON
		.toss(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingObj, callback) {
			var waitingHash = context.WaitingList(waitingObj);
			context.logger.debug("Find next in waiting list");
			//get the request with the lowest index (front of waiting list)
			var lowestKey = waitingHash.nextInQueue();
			//there may be a request that needs to claim a core, or there may not
			//designate logic of allocating cores to the allocation module
			//pass all the information needed to the allocation module
			callback(lowestKey, waitingHash, requestKV, context);
		}) //"this" keyword won't work for attemptCoreAllocation when passed through
		//functionite. use the "with" function in functionite to establish context
		.pass(jobLogic.attemptCoreAllocation).with(jobLogic)
		.pass(function (newWaitingHash, updateWaitingList) {
			//recalculate the positions of the new waiting list and send that over websockets
			var positionMap = newWaitingHash.getQueuePositions();
			//store and submit the position information of each user by their id
			for (var id in positionMap) {
				context.socketHandler.updatePosition(id, positionMap[id]);
			}
			//delete any jobs that shouldn't be running anymore
			//query nomad for all the jobs running
			context.nomader.getJobs(context.nomadAddress, function (jobs) {
				//filter jobs so we only see core-hmi jobs
				var coreHmis = jobs.filter(function (element) {
					return element.ID.startsWith("core-hmi");
				});
				//check request keys to ensure that every job that exists
				//link back to a request key. if not, delete the job
				for (let i = 0; i < coreHmis.length; i++) {
					//extract the id from the job name
					var jobName = coreHmis[i].ID;
					//split core-hmi-X into [core, hmi, X], retrieve X
					var userId = jobName.split("-")[2];
					if (!requestKV[userId]) {
						//delete the job.
						context.logger.debug("Delete job " + userId);
						context.nomader.deleteJob(jobName, context.nomadAddress, function (res) {
							context.logger.debug(res);
						});
					}
				}
			});

			//only update the waiting list if it needs to be updated.
			if (updateWaitingList) {
				context.logger.debug("Waiting list update!");
				//update the waiting list
				context.consuler.setKeyValue(context.keys.data.waiting, newWaitingHash.get(), function (){});
			}
		})
		.go();
	}
}

//allocation list update
function allocationWatch (context) {
	return function () {
		context.logger.debug("allocation watch hit");
		//get allocation keys and values
		functionite()
		.pass(context.consuler.getKeyAll, context.keys.allocation)
		.pass(functionite(core.transformKeys), context.keys.data.allocation)
		.pass(function (allocationKeys, callback) {
			/*each key has a value that is stringified JSON of the following format:
			var data = {
				userPort: null,
				brokerPort: null,
				tcpPort: null,
				coreAddress: null,
				corePort: null
			};
			*/
			//go through each property found (key is the id of the user)
			//and generate connection information to send, as well as update the HAProxy KV 
			for (var key in allocationKeys) {
				var userId = key;
				var pair = {
					id: userId,
					userAddressInternal: hmiService.Address + ":" + hmiService.Port,
					hmiAddressInternal: coreAddress + ":" + corePort,
					tcpAddressInternal: coreAddress + ":" + tcpPort,
					brokerAddressInternal: hmiService.Address + ":" + data.brokerPort,
					userAddressExternal: data.requestObj.userToHmiPrefix,
					hmiAddressExternal: data.requestObj.hmiToCorePrefix,
					tcpPortExternal: data.requestObj.tcpPortExternal,
					brokerAddressExternal: data.requestObj.brokerAddressPrefix
				}
				//pair information!
				context.logger.debug(JSON.stringify(pair, null, 2));
				//post/store the connection information to the client whose id matches
				//format the connection information and send it!
				context.socketHandler.updateAddresses(pair.id, core.formatPairResponse(pair));
				//update the proxy information using the proxy module (not manticore addresses!)
				if (context.isHaProxyEnabled()) {
					context.logger.debug("Updating KV Store with data for proxy!");
					var template = proxyLogic.updateCoreHmiKvStore(context, pair);
				}							
			}
		})
		.go();
	}
}

//core service update
function coreWatch (context) {
	return function (services) {
		//should just be one core per job
		var coreServices = core.filterServices(services, []);
		context.logger.debug("Core services: " + coreServices.length);
		if (coreServices.length > 0) {
			var coreService = coreServices[0];
			//split core-hmi-X into [core, hmi, X], retrieve X
			var userId = coreService.Service.split("-")[2];
			var jobName = "core-hmi-" + userId;
			//due to bugs with Consul, we need to make a check with Nomad
			//to make sure that this service has a corresponding job.
			//if it's a rogue service, ignore it, as it likely cannot be removed in any elegant way
			context.nomader.findJob(jobName, context.nomadAddress, function (job) {
				//use the job that was submitted to append an hmi group and resubmit it
				if (job && !checkJobForHmi(job)) { //job exists for this service and doesn't have an HMI. add an hmi and submit
					//get the request object stored for this user id
					context.consuler.getKeyValue(context.keys.data.request + "/" + userId, function (result) {
						var requestObj = context.UserRequest().parse(result.Value);
						//add the hmi group and submit the job
						jobLogic.addHmiGenericGroup(job, coreService, requestObj);
						jobLogic.submitJob(context, job, jobName);	
					});
				}
			});	
		}
	}
}

//hmi service update
function hmiWatch (context) {
	return function (services) {
		//require an http alive check. should only be one hmi service
		var hmiServices = core.filterServices(services, ['hmi-alive']); 
		context.logger.debug("Hmi services: " + hmiServices.length);
		if (hmiServices.length > 0) {
			var hmiService = hmiServices[0];
			//split core-hmi-X into [core, hmi, X], retrieve X
			var userId = hmiService.Service.split("-")[2];
			var jobName = "core-hmi-" + userId;
			//should just be one hmi per job
			//due to bugs with Consul, we need to make a check with Nomad
			//to make sure that this service has a corresponding job.
			//if it's a rogue service, ignore it, as it likely cannot be removed in any elegant way
			context.nomader.findJob(jobName, context.nomadAddress, function (job) {
				if (job) { //job exists for this service	
					getConnectionInformation(job);
				}
			});				
		}

		function getConnectionInformation (job) {
			//we need three things. the ID, the request data from the KV store, 
			//and the allocation details of this core task
			//this regex will find the allocation ID within the ID of this service
			var hmiAllocID = hmiService.ID.match(/[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+/g)[0];
			//store important information here
			var data = {
				userPort: null,
				brokerPort: null,
				tcpPort: null,
				coreAddress: null,
				corePort: null
			};

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
			.toss(context.consuler.getService, "core-service-" + userId)
				var coreAllocID = coreServices[0].Service.ID.match(/[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+/g)[0];
				//while we are getting the core service, retrieve the core address and port to be used later
				data.coreAddress = coreServices[0].Service.Address;
				data.corePort = coreServices[0].Service.Port;
				callback(coreAllocID, context.nomadAddress);
			}) //get the allocation info
			.pass(context.nomader.getAllocation)
			.pass(function (allocationResult, callback) {
				var tcpPort;
				if (allocationResult.Resources.Networks[0].DynamicPorts[0].Label === "tcp") {
					tcpPort = allocationResult.Resources.Networks[0].DynamicPorts[0].Value;
				}
				else {
					tcpPort = allocationResult.Resources.Networks[0].DynamicPorts[1].Value;
				}
				callback();
			}) //take all the information we got and store it in the KV under allocations for the user
			.toss(context.consuler.setKeyValue, context.keys.data.allocation + "/" + userId, JSON.stringify(data))
			.go();
		}
	}
}

//manticore services update
function manticoreWatch (context) {
	return function (services) {
		var manticores = core.filterServices(services, ['manticore-alive']); //require an http alive check
		context.logger.debug("Manticore services: " + manticores.length);	
		//ONLY update the manticore services in the KV store
		context.logger.debug("Updating KV Store with manticore data for proxy!");
		var template = proxyLogic.generateProxyData(context, {pairs: []}, manticores);
		proxyLogic.updateManticoreKvStore(context, template);		
	}
}

function checkJobForHmi (job) {
	//return whether this job has an HMI in it
	var taskGroupCount = job.getJob().Job.TaskGroups.length;
	var foundHMI = false;
	for (let i = 0; i < taskGroupCount; i++) {
		if (job.getJob().Job.TaskGroups[i].Name.startsWith("hmi-group")) {
			foundHMI = true;
			break;
		}
	}
	return foundHMI;
}

function updateJob (context, localJob, jobName) {
	context.nomader.findJob(jobName, context.nomadAddress, function (job) {
		context.logger.debug("CHECKING CONTENTS FOR " + jobName);
		//only submit the job if the HMI does not already exist yet in the running job spec
		var taskGroupCount = job.getJob().Job.TaskGroups.length;
		var foundHMI = false;
		for (let i = 0; i < taskGroupCount; i++) {
			if (job.getJob().Job.TaskGroups[i].Name.startsWith("hmi-group")) {
				foundHMI = true;
				break;
			}
		}
		if (!foundHMI) {
			//attempt to submit the updated job
			context.logger.debug("Submitting for " + jobName);
			localJob.submitJob(context.nomadAddress, function (result) {
				context.logger.debug(result);
			});
		}
	});
}
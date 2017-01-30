var functionite = require('functionite');
var core = require('./core.js');
//SUBFOLDER MODULES
var allocationLogic = require('./allocation/shell.js');
var proxyLogic = require('./proxy/shell.js');

module.exports = {
	startKvWatch: function (context) {
		//set up watches for the KV store
		//pass in the context to the watch functions
		context.consuler.watchKVStore(context.keys.request, requestsWatch(context));
		context.consuler.watchKVStore(context.keys.waiting, waitingWatch(context));
	},
	startServiceWatch: function (context) {
		//set up a watch for all services
		context.consuler.watchServices(serviceWatch(context));
	}
}

//wrap the context in these functions so we have necessary functionality

//request list update
function requestsWatch (context) {
	return function (requestKeyArray) { //given from Consul
		logger.debug("request watch hit");
		//trim the prefixes of the requestKeyArray so we just get the inner-most key names
		for (let i = 0; i < requestKeyArray.length; i++) {
			requestKeyArray[i] = requestKeyArray[i].split(context.keys.data.request + "/")[1];
		}
		var lock;
		//get waiting key and value, but first acquire a lock
		functionite()
		.pass(function (callback) {
			//lock functionality
			lock = context.consuler.lock(context.keys.waiting + "/"); //lock the directory
			lock.on('acquire', function () {
				callback(); //continue
			});
			lock.on('end', function () {
				logger.debug("Manticore instance at " + process.env.NOMAD_IP_http + " is done with lock!");
			});
			lock.acquire();
		})
		.pass(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingValue) {
			var waitingHash = context.WaitingList(waitingValue);
			waitingHash.update(requestKeyArray);
			//use the updated request list to remove any connection sockets that have info about a user
			context.socketHandler.cleanSockets(requestKeyArray);
			logger.debug("Waiting list update");
			logger.debug(waitingHash.get());
			//update manticore/waiting/data using the updated object generated
			context.consuler.setKeyValue(context.keys.data.waiting, waitingHash.get(), function () {
				lock.release(); //release waiting list lock
			});
		})
		.go()
	}
}

//waiting list update
function waitingWatch (context) {
	return function () {
		logger.debug("waiting watch hit");
		//waiting list updated
		var requestKV;
		var lock;
		//get request keys and values
		functionite()
		.pass(context.consuler.getKeyAll, context.keys.request)
		.pass(functionite(core.transformKeys), context.keys.data.request)
		.pass(function (requestKeys, callback) {
			//store requestKeys for future use
			requestKV = requestKeys;
			callback();
		}) //get waiting list. the waiting list is one value as a stringified JSON
		.toss(function () {
			//lock functionality
			lock = context.consuler.lock(context.keys.waiting + "/"); //lock the directory
			lock.on('acquire', function () {
				callback(); //continue
			});
			lock.on('end', function () {
				logger.debug("Manticore instance at " + process.env.NOMAD_IP_http + " is done with lock!");
			});
			lock.acquire();
		})
		.toss(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingObj, callback) {
			var waitingHash = context.WaitingList(waitingObj);
			logger.debug("Find next in waiting list");
			//also, calculate the position of each user in the waiting list using the KV store
			var positionMap = waitingHash.getQueuePositions();
			//store and submit the position information of each user by their id
			for (var id in positionMap) {
				context.socketHandler.setPosition(id, positionMap[id]);
				context.socketHandler.send(id, "position");
			}
			//get the request with the lowest index (front of waiting list)
			var lowestKey = waitingHash.nextInQueue();
			//there may be a request that needs to claim a core, or there may not
			//designate logic of allocating cores to the allocation module
			//pass all the information needed to the allocation module
			callback(lowestKey, waitingHash, requestKV, context);
		})
		.pass(allocationLogic.attemptCoreAllocation)
		.pass(function (newWaitingHash, requestKV) {
			//use this new waiting list to submit the core job and update the waiting list!
			var coreJob = allocationLogic.buildJob(context, newWaitingHash, requestKV, false);
			updateJob(context, coreJob, "core");
			consuler.setKeyValue(context.keys.data.waiting, newWaitingHash.get(), function (){
				lock.release(); //done with the lock
			});
		})
		.go();
	}
}

//services update
function serviceWatch (context) {
	return function (services) { //given from consul-helper, with helper methods
		logger.debug("Services update");
		//services updated. get information about core and hmi if possible
		let cores = services.filter("core-master");
		let hmis = services.filter("hmi-master");
		let manticores = services.filter("manticore-service");
		logger.debug("Core services: " + cores.length);
		logger.debug("Hmi services: " + hmis.length);
		logger.debug("Manticore services: " + manticores.length);

		//for every core service, ensure it has a corresponding HMI
		var job = context.nomader.createJob("hmi");
		allocationLogic.addHmisToJob(job, cores);
		//submit the job. if there are no task groups then
		//we want to remove the job completely. delete the job in that case
		updateJobs(context, job, "hmi");

		var pairs = core.findPairs(cores, hmis, function (id) {
			//remove user from KV store because the HMI has no paired core which
			//indicates that the user exited the HMI page and is done with their instance
			context.consuler.delKey(context.keys.data.request + "/" + id, function () {});
		});
		pairs = {
			pairs: pairs
		};
		//post all pairs at once
		logger.info(pairs);

		//go through each pair, and post/store the connection information to each listening client
		for (let i = 0; i < pairs.pairs.length; i++) {
			var pair = pairs.pairs[i];
			//format the connection information and send it!
			context.socketHandler.setAddresses(pair.id, core.formatPairResponse(pair));
			context.socketHandler.send(pair.id, "connectInfo");
		}
		//update the proxy information using the proxy module
		if (context.isHaProxyEnabled()) {
			logger.debug("Updating KV Store with data for proxy!");
			var template = proxyLogic.generateProxyData(context, pairs, manticores);
			proxyLogic.updateKvStore(context, template);
		}
	}
}

function updateJob (context, localJob, jobName) {
	//only submit the job if any information has changed
	context.nomader.findJob(jobName, context.agentAddress, function (job) {
		logger.debug("CHECKING CONTENTS FOR " + jobName);
		var changed = core.compareJobStates(localJob, job);
		if (!changed) {
			logger.debug("Job files are the same!");
		}
		else {
			logger.debug("Job files are different!");
			//attempt to submit the updated job
			var isTasks = core.checkTaskCount(localJob);
			if (isTasks) { //there are tasks. submit the job
				logger.debug(jobName + " tasks exist");
				logger.debug(localJob.getJob().Job.TaskGroups.length);
				localJob.submitJob(context.agentAddress, function (result) {
					logger.debug(result);
				});
			}
			else { //there are no tasks. delete the job
				logger.debug("No " + jobName + " tasks");
				context.nomader.deleteJob(jobName, nomadAddress, function () {});
			};
		}
	});
}
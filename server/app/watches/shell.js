var functionite = require('functionite');
var core = require('./core.js');
//SUBFOLDER MODULES
var jobLogic = require('./job/shell.js');
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
//warning: releasing locks triggers an update for the KV store

//request list update
function requestsWatch (context) {
	return function (requestKeyArray) { //given from Consul
		context.logger.debug("request watch hit");
		//trim the prefixes of the requestKeyArray so we just get the inner-most key names
		for (let i = 0; i < requestKeyArray.length; i++) {
			requestKeyArray[i] = requestKeyArray[i].split(context.keys.data.request + "/")[1];
		}
		var lock;
		//get waiting key and value, but first acquire a lock
		functionite()
		.pass(function (callback) {
			//lock functionality
			//lock = context.consuler.lock(context.keys.waiting + "/"); //lock the directory
			//lock.on('acquire', function () {
				callback(); //continue
			//});
			//lock.on('end', function () {
			//	context.logger.debug("Manticore instance at " + process.env.NOMAD_IP_http + " is done with lock!");
			//});
			//lock.acquire();
		})
		.pass(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingValue) {
			var waitingHash = context.WaitingList(waitingValue);
			waitingHash.update(requestKeyArray);
			//use the updated request list to remove any connection sockets that have info about a user
			context.socketHandler.cleanSockets(requestKeyArray);
			context.logger.debug("Waiting list update");
			context.logger.debug(waitingHash.get());
			//update manticore/waiting/data using the updated object generated
			context.consuler.setKeyValue(context.keys.data.waiting, waitingHash.get(), function () {
				//lock.release(); //release waiting list lock
			});
		})
		.go()
	}
}

//waiting list update
function waitingWatch (context) {
	return function () {
		context.logger.debug("waiting watch hit");
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
		.toss(context.consuler.getKeyValue, context.keys.data.waiting)
		.pass(function (waitingObj, callback) {
			var waitingHash = context.WaitingList(waitingObj);
			context.logger.debug("Find next in waiting list");
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
		}) //"this" keyword won't work for attemptCoreAllocation when passed through
		//functionite. use the "with" function in functionite to establish context
		.pass(jobLogic.attemptCoreAllocation).with(jobLogic)
		.pass(function (newWaitingHash, requestKV, updateWaitingList) {
			//only update the waiting list if it needs to be updated.
			//but always try to submit the current job state
			var coreJob = jobLogic.buildCoreJob(context, newWaitingHash, requestKV);
			updateJob(context, coreJob, "core");

			if (updateWaitingList) {
				context.logger.debug("Waiting list update!");
				//update the waiting list
				//lock functionality
				//lock = context.consuler.lock(context.keys.waiting + "/"); //lock the directory
				//lock.on('acquire', function () {
					context.consuler.setKeyValue(context.keys.data.waiting, newWaitingHash.get(), function (){
						//lock.release(); //done with the lock
					});
				//});
				//lock.on('end', function () {
					//context.logger.debug("Manticore instance at " + process.env.NOMAD_IP_http + " is done with lock!");
				//});
				//lock.acquire();
			}
		})
		.go();
	}
}

//services update
function serviceWatch (context) {
	return function (services) { //given from consul-helper, with helper methods
		context.logger.debug("Services update");
		//services updated. get information about core and hmi if possible
		let cores = services.filter("core-master");
		let hmis = services.filter("hmi-master");
		let manticores = services.filter("manticore-service");
		context.logger.debug("Core services: " + cores.length);
		context.logger.debug("Hmi services: " + hmis.length);
		context.logger.debug("Manticore services: " + manticores.length);

		//for every core service, ensure it has a corresponding HMI
		var job = context.nomader.createJob("hmi");
		jobLogic.addHmisToJob(context, job, cores);
		//submit the job. if there are no task groups then
		//we want to remove the job completely. delete the job in that case
		updateJob(context, job, "hmi");
		//TODO: remove context dependency for findPairs
		var pairs = core.findPairs(cores, hmis, context, function (id) {
			//remove user from KV store because the HMI has no paired core which
			//indicates that the user exited the HMI page and is done with their instance
			context.logger.debug("HMI with no core. Stop serving " + id);
			context.consuler.delKey(context.keys.data.request + "/" + id, function () {});
		});
		pairs = {
			pairs: pairs
		};
		//post all pairs at once
		context.logger.info(pairs);

		//go through each pair, and post/store the connection information to each listening client
		for (let i = 0; i < pairs.pairs.length; i++) {
			var pair = pairs.pairs[i];
			//format the connection information and send it!
			context.socketHandler.setAddresses(pair.id, core.formatPairResponse(pair));
			context.socketHandler.send(pair.id, "connectInfo");
		}
		//update the proxy information using the proxy module
		if (context.isHaProxyEnabled()) {
			context.logger.debug("Updating KV Store with data for proxy!");
			var template = proxyLogic.generateProxyData(context, pairs, manticores);
			proxyLogic.updateKvStore(context, template);
		}
	}
}

function updateJob (context, localJob, jobName) {
	//only submit the job if any information has changed
	context.nomader.findJob(jobName, context.nomadAddress, function (job) {
		context.logger.debug("CHECKING CONTENTS FOR " + jobName);
		var changed = core.compareJobStates(localJob, job);
		if (!changed) {
			context.logger.debug("Job files are the same!");
		}
		else {
			context.logger.debug("Job files are different!");
			//attempt to submit the updated job
			var taskCount = core.checkTaskCount(localJob);
			if (taskCount > 0) { //there are tasks. submit the job
				context.logger.debug(jobName + " tasks exist");
				context.logger.debug(localJob.getJob().Job.TaskGroups.length);
				localJob.submitJob(context.nomadAddress, function (result) {
					context.logger.debug(result);
				});
			}
			else { //there are no tasks. delete the job
				context.logger.debug("No " + jobName + " tasks");
				context.nomader.deleteJob(jobName, context.nomadAddress, function () {});
			};
		}
	});
}
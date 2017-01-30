var core = require('./core.js');

module.exports = {
	//this will find a final state in which the maximum number of users are able to receive
	//a core/hmi so that only one job submission to Nomad is necessary
	//this is a recursive function
	attemptCoreAllocation: function (lowestKey, waitingHash, requestKV, context, callback) {
		//check if lowestKey exists (aka someone is in front of the waiting list, waiting)
		if (lowestKey) {
			logger.debug("Lowest key found:");
			logger.debug(lowestKey);
			//since we are testing if the user from the waiting list can claim core/hmi
			//we must include that information for this test!
			waitingHash.setClaimed(lowestKey, true);
			//check if it is possible to run an additional core AND hmi without actually running it
			//only include requests that have claimed a core/hmi or are attempting to claim one
			var dummyJob = this.buildJob(context, waitingHash, requestKVs, true);

			//test submission!
			dummyJob.planJob(context.agentAddress, "cores-and-hmis", function (results) {
				var canAllocate = core.checkHasResources(results);
				if (canAllocate) {
					logger.debug("Core and HMI can be allocated!");
					//recurse through this function again with the new waitingHash
					//and finding a new lowestKey
					var newLowest = waitingHash.nextInQueue();
					attemptCoreAllocation(newLowest, waitingHash, requestKV, context, callback);
				}
				else {
					//error: insufficient resources. revert the claimed parameter of the lowest key
					logger.debug("Core and HMI cannot be allocated!");
					waitingHash.setClaimed(lowestKey, false);
					//done.
					callback(waitingHash, requestKV);
				});
			});
		}
		else { //we are done: no more users in the waiting list
			callback(waitingHash, requestKV);
		}
	},
	//TODO: this method is flawed. it groups everything into the core job file
	//but what about the potentially running HMI file? that means we could be
	//counting HMI tasks twice and that skews our results!
	//only include hmis for newly added cores during the testing process
	buildJob: function (context, waitingHash, requestKVs, includeDummyHmiTasks) {
		var job = context.nomader.createJob("core");
		var filteredRequests = waitingHash.filterRequests(requestKV);
		logger.debug("filtered requests");
		logger.debug(filteredRequests);
		//for every claimed user, build a task for them and add it to the job file
		for (var key in filteredRequests) {
			var request = context.UserRequest().parse(filteredRequests[key]);
			core.addCoreGroup(job, key, request);
			//add an HMI to this test job file only if asked for
			if (includeDummyHmiTasks) {
				var coreServiceExample = {
					Tags: [request.toCoreTag()],
					Address: "127.0.0.1",
					Port: 3000
				};
				core.addHmiGenericGroup(job, 
					coreServiceExample, 
					process.env.HAPROXY_HTTP_LISTEN, 
					context.UserRequest().parse(core.Tags[0]));			
			}
		}
		return job; //job created
	},
	addHmisToJob: function (job, cores) {
		for (let i = 0; i < cores.length; i++) {
			//pass in what is repesenting the user in order to name the service
			//pass in the external address prefix of core so that when the user tries to connect to it
			//from outside the network haproxy can route that IP address to the correct internal one
			core.addHmiGenericGroup(job, cores[i], process.env.HAPROXY_HTTP_LISTEN);
		}	
	},
}
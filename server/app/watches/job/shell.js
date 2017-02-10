var core = require('./core.js');

module.exports = {
	//this will find a final state in which the maximum number of users are able to receive
	//a core/hmi so that only one job submission to Nomad is necessary
	//this is a recursive function
	//job, waitinglist update
	attemptCoreAllocation: function (lowestKey, waitingHash, requestKV, context, callback) {
		//call the recursive function with an empty job and no update to the waiting list
		this.coreAllocRecurse(lowestKey, waitingHash, requestKV, context, null, false, 
			function (newWaitingHash, requestKV, updateWaitingList) {
			callback(newWaitingHash, requestKV, updateWaitingList);
		});
	},
	coreAllocRecurse: function (lowestKey, waitingHash, requestKV, context, job, updateWaitingList, callback) {
		var self = this; //consistent reference to this exported object
		//check if lowestKey exists (aka someone is in front of the waiting list, waiting)
		if (lowestKey) {
			context.logger.debug("Lowest key found:");
			context.logger.debug(lowestKey);
			//since we are testing if the user from the waiting list can claim core/hmi
			//we must include that information for this test!
			waitingHash.setClaimed(lowestKey, true);
			//if the job is null, then make a job that represents the current state of cores/hmis
			var filteredRequests = waitingHash.filterRequests(requestKV);
			if (!job) {
				job = self.buildCoreJob(context, waitingHash, requestKV);
				//we have the cores now. get the current state of the HMI job and
				//don't include those tasks in our dummy job since those HMIs are already counted
				//towards allocation space
				self.excludeRunningHmis(context, filteredRequests, function (hmiIds) {
					//add an HMI to this test job file for every id found in hmiIds
					for (let i = 0; i < hmiIds.length; i++) {
						var request = context.UserRequest().parse(filteredRequests[hmiIds[i]]);
						var coreServiceExample = {
							Tags: [request.toCoreTag()],
							Address: "127.0.0.1",
							Port: 3000
						};
						core.addHmiGenericGroup(job, 
							coreServiceExample, 
							process.env.HAPROXY_HTTP_LISTEN, 
							context.UserRequest().parse(coreServiceExample.Tags[0]));	
					}
					evaluateJob(); //now evaluate the job!
				});
			}
			else { //job is not null. add a new core/hmi for the lowestKey and then evaluate
				//we know the task for lowest key doesn't exist so we can make both core and hmi
				var request = context.UserRequest().parse(filteredRequests[lowestKey]);
				core.addCoreGroup(job, lowestKey, request);
				var coreServiceExample = {
					Tags: [request.toCoreTag()],
					Address: "127.0.0.1",
					Port: 3000
				};
				core.addHmiGenericGroup(job, 
					coreServiceExample,
					process.env.HAPROXY_HTTP_LISTEN, 
					context.UserRequest().parse(coreServiceExample.Tags[0]));
				evaluateJob();
			}
		}
		else { //we are done: no more users in the waiting list
			context.logger.debug("No more in waiting list");
			callback(waitingHash, requestKV, updateWaitingList);
		}

		function evaluateJob () {
			//test submission! we are using "core" because we want to pretend to
			//replace that job file with more cores and hmis
			job.planJob(context.nomadAddress, "core", function (results) {
				var canAllocate = core.checkHasResources(results);
				if (canAllocate) {
					context.logger.debug("Core and HMI can be allocated!");
					//we will update the waiting list for this new allocation
					updateWaitingList = true;
					//recurse through this function again with the new waitingHash
					//and finding a new lowestKey. also, pass in the job we created so far
					//as we will just add onto it for another test submission
					var newLowest = waitingHash.nextInQueue();
					self.coreAllocRecurse(newLowest, waitingHash, requestKV, context, job, updateWaitingList, callback);
				}
				else {
					//error: insufficient resources. revert the claimed parameter of the lowest key
					context.logger.debug("Core and HMI cannot be allocated!");
					if (!results.FailedTGAllocs) {
						context.logger.debug(JSON.stringify(results, null, 4));
					}
					else {
						context.logger.debug(JSON.stringify(results.FailedTGAllocs, null, 4));
					}
					
					waitingHash.setClaimed(lowestKey, false);
					//done.
					callback(waitingHash, requestKV, updateWaitingList);
				};
			});
		}
	},
	excludeRunningHmis: function (context, filteredRequests, callback) {
		context.nomader.findJob("hmi", context.nomadAddress, function (job) {
			//check task groups in the HMI job
			var hmiIds = [];
			if (job && job.getJob().Job && job.getJob().Job.TaskGroups) {
				var taskGroups = job.getJob().Job.TaskGroups;
				for (let i = 0; i < taskGroups.length; i++) {
					var taskName = taskGroups[i].Name;
					hmiIds.push(taskName.split("-")[1]); //only include the id after the hyphen
				}
			}
			var necessaryHmiIds = [];
			for (let key in filteredRequests) {
				if (hmiIds.indexOf(filteredRequests[key]) === -1) {
					//there isn't an HMI running for the corresponding ID. we need to include this
					necessaryHmiIds.push(key);
				}
			}
			callback(necessaryHmiIds);
		});
	},
	buildCoreJob: function (context, waitingHash, requestKV) {
		var job = context.nomader.createJob("core");
		var filteredRequests = waitingHash.filterRequests(requestKV);
		context.logger.debug("filtered requests");
		context.logger.debug(filteredRequests);
		//for every claimed user, build a task for them and add it to the job file
		for (var key in filteredRequests) {
			var request = context.UserRequest().parse(filteredRequests[key]);
			core.addCoreGroup(job, key, request);
		}
		return job; //job created
	},
	addHmisToJob: function (context, job, cores) {
		for (let i = 0; i < cores.length; i++) {
			//pass in what is repesenting the user in order to name the service
			//pass in the external address prefix of core so that when the user tries to connect to it
			//from outside the network haproxy can route that IP address to the correct internal one
			core.addHmiGenericGroup(job, cores[i], process.env.HAPROXY_HTTP_LISTEN,
				context.UserRequest().parse(cores[i].Tags[0]));
		}	
	}
}
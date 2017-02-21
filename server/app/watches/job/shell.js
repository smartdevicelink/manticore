var core = require('./core.js');

module.exports = {
	//this will find a final state in which the maximum number of users are able to receive
	//a core/hmi so that only one job submission to Nomad is necessary
	//this is a recursive function
	//job, waitinglist update
	attemptCoreAllocation: function (lowestKey, waitingHash, requestKV, context, callback) {
		//call the recursive function with an empty job and no update to the waiting list
		this.coreAllocRecurse(lowestKey, waitingHash, requestKV, context, false, 
			function (newWaitingHash, updateWaitingList) {
			callback(newWaitingHash, updateWaitingList);
		});
	},
	coreAllocRecurse: function (lowestKey, waitingHash, requestKV, context, updateWaitingList, callback) {
		var self = this; //consistent reference to this exported object
		//check if lowestKey exists (aka someone is in front of the waiting list, waiting)
		if (lowestKey) {
			context.logger.debug("Lowest key found:");
			context.logger.debug(lowestKey);
			//since we are testing if the user from the waiting list can claim core/hmi
			//we must include that information for this test!
			waitingHash.setClaimed(lowestKey, true);
			//make a job to test the submission of a new core/hmi
			var job = context.nomader.createJob("core-hmi-" + lowestKey);
			context.logger.debug(JSON.stringify(requestKV, null, 2));
			var request = context.UserRequest().parse(requestKV[lowestKey]);

			core.addCoreGroup(job, lowestKey, request);
			//make a mock HMI
			var coreServiceExample = {
				Tags: [request.getString()],
				Address: "127.0.0.1",
				Port: 3000
			};
			core.addHmiGenericGroup(job, 
				coreServiceExample,
				context.UserRequest().parse(coreServiceExample.Tags[0]));

			//test submission!
			job.planJob(context.nomadAddress, "core-hmi-" + lowestKey, function (results) {
				var canAllocate = core.checkHasResources(results);
				if (canAllocate) {
					context.logger.debug("Core and HMI can be allocated!");
					//we will update the waiting list for this new allocation
					updateWaitingList = true;
					//recurse through this function again with the new waitingHash
					//furthermore, submit the job since we have the resources!
					var actualJob = context.nomader.createJob("core-hmi-" + lowestKey);
					core.addCoreGroup(actualJob, lowestKey, request);

					self.submitJob(context, actualJob, "core-hmi-" + lowestKey, function () {
						//submission process done
						//now check the next user in the queue only when we can confirm the job is running
						//so that the next planJob command will take into account the job that was just submitted
						//maximum wait of 5 seconds before we poke the nomad server again for allocation information
						var watch = context.nomader.watchAllocations("core-hmi-" + lowestKey, context.nomadAddress, 5, function (allocations) {
							var coreAllocation = allocations[0];
							//this function will be called several times. only continue when we see that the 
							//client status's state is "running". since we checked with plan that this
							//job submission will work, it should eventually end up in the "running" state
							if (coreAllocation.ClientStatus === "running") {
								var newLowest = waitingHash.nextInQueue();
								//we got what we wanted. remember to stop the watch or else bad things happen!
								watch.end();
								self.coreAllocRecurse(newLowest, waitingHash, requestKV, context, updateWaitingList, callback);
							}
						});
					});
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
					callback(waitingHash, updateWaitingList);
				};
			});
		}
		else { //we are done: no more users in the waiting list
			context.logger.debug("No more in waiting list");
			callback(waitingHash, updateWaitingList);
		}
	},
	addHmisToJob: function (context, job, cores) {
		for (let i = 0; i < cores.length; i++) {
			//pass in what is repesenting the user in order to name the service
			//pass in the external address prefix of core so that when the user tries to connect to it
			//from outside the network haproxy can route that IP address to the correct internal one
			core.addHmiGenericGroup(job, cores[i], context.UserRequest().parse(cores[i].Tags[0]));
		}	
	},
	addCoreGroup: function (job, userId, request) {
		core.addCoreGroup(job, userId, request);
	},
	addHmiGenericGroup: function (job, coreService, request) {
		core.addHmiGenericGroup(job, coreService, request);
	},
	submitJob: function (context, localJob, jobName, callback) {
		//attempt to submit the updated job
		context.logger.debug("Submitting job " + jobName);
		localJob.submitJob(context.nomadAddress, function (result) {
			context.logger.debug(result);
			callback();
		});
	}
}
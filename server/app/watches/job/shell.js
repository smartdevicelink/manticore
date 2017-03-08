var core = require('./core.js');

/** @module app/watches/job/shell */

module.exports = {
	/**
	* Find a final state in which the maximum number of users are able to receive a core/hmi
	* @param {string} lowestKey - ID of the user in front of the waiting list
	* @param {object} waitingHash - Waiting list KV
	* @param {object} requestKV - Request list KV
	* @param {Context} context - Context instance
	* @param {attemptCoreAllocationCallback} callback - callback
	*/
	attemptCoreAllocation: function (lowestKey, waitingHash, requestKV, context, callback) {
		//call the recursive function with an empty job and no update to the waiting list
		this.coreAllocRecurse(lowestKey, waitingHash, requestKV, context, false, 
			function (newWaitingHash, updateWaitingList) {
			callback(newWaitingHash, updateWaitingList);
		});
	},
	/**
	* Callback object for attemptCoreAllocation
	* @callback attemptCoreAllocationCallback
	* @param {object} newWaitingHash - The new representation of the waiting list
	* @param {boolean} updateWaitingList - A boolean saying whether the waiting list has changed
	*/

	/**
	* Find a final state in which the maximum number of users are able to receive a core/hmi. Recursive
	* @param {string} lowestKey - ID of the user in front of the waiting list
	* @param {object} waitingHash - Waiting list KV
	* @param {object} requestKV - Request list KV
	* @param {Context} context - Context instance
	* @param {boolean} updateWaitingList - A boolean saying whether the waiting list has changed
	* @param {coreAllocRecurseCallback} callback - callback
	*/
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

					self.submitJobAndWaitForAllocation(context, actualJob, lowestKey, function () {
						//allocation exists. the planJob will consider the allocation now
						var newLowest = waitingHash.nextInQueue();
						//try again
						self.coreAllocRecurse(newLowest, waitingHash, requestKV, context, updateWaitingList, callback);
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
	/**
	* Callback object for coreAllocRecurse
	* @callback coreAllocRecurseCallback
	* @param {object} waitingHash - The new representation of the waiting list
	* @param {boolean} updateWaitingList - A boolean saying whether the waiting list has changed
	*/

	/**
	* Submits a job and pauses execution of submitting new jobs until the allocation for this submitted job runs
	* @param {Context} context - Context instance
	* @param {object} actualJob - Object of the job file intended for submission to Nomad
	* @param {string} lowestKey - ID of the user in front of the waiting list
	* @param {function} callback - empty callback
	*/
	submitJobAndWaitForAllocation: function (context, actualJob, lowestKey, callback) {
		this.submitJob(context, actualJob, "core-hmi-" + lowestKey, function () {
			//submission process done
			//now check the next user in the queue only when we can confirm the job is running
			//so that the next planJob command will take into account the job that was just submitted
			//maximum wait of 5 seconds before we poke the nomad server again for allocation information
			var watch = context.nomader.watchAllocations("core-hmi-" + lowestKey, context.nomadAddress, 5, function (allocations) {
				//this function will be called several times. only continue when we see that the 
				//core task group status's state is "running". since we checked with plan that this
				//job submission will work, it should eventually end up in the "running" state
				//there is a small chance that the HMI will have been submitted and thus we will 
				//see the allocation of the core group and the hmi group. make sure we get the right task group
				var coreAllocation;
				if (allocations[0] && allocations[0].TaskGroup === "core-group-" + lowestKey) {
					coreAllocation = allocations[0];
				}
				else if (allocations[1]) { 
					//by process of elimination, the second allocation has the core group
					//let's make sure there is a second allocation...
					coreAllocation = allocations[1];
				}
				if (coreAllocation) { //make sure we found something
					if (coreAllocation.ClientStatus === "running") {
						//we got what we wanted. remember to stop the watch or else bad things happen!
						watch.end();
						callback();
					}
				}
			});
		});
	},
	/**
	* Add a task group for sdl_core to the job file
	* @param {object} job - Object of the job file intended for submission to Nomad
	* @param {string} userId - ID of the user
	* @param {UserRequest} request - A single request from the request list
	*/
	addCoreGroup: function (job, userId, request) {
		core.addCoreGroup(job, userId, request);
	},
	/**
	* Add a task group for the generic HMI to the job file
	* @param {object} job - Object of the job file intended for submission to Nomad
	* @param {object} coreService - An object from Consul that describes a service
	* @param {UserRequest} request - A single request from the request list
	*/
	addHmiGenericGroup: function (job, coreService, request) {
		core.addHmiGenericGroup(job, coreService, request);
	},
	/**
	* 
	* @param {Context} context - Context instance
	* @param {object} localJob - Object of the job file intended for submission to Nomad
	* @param {string} jobName - Name of the job
	* @param {function} callback - empty callback
	*/
	submitJob: function (context, localJob, jobName, callback) {
		//attempt to submit the updated job
		context.logger.debug("Submitting job " + jobName);
		localJob.submitJob(context.nomadAddress, function (result) {
			context.logger.debug(result);
			callback();
		});
	}
}
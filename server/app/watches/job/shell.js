var core = require('./core.js');

/** @module app/watches/job/shell */

module.exports = {
	/**
	* Determines whether the user in front of the waiting list can be assigned a core/hmi
	* @param {string} lowestKey - ID of the user in front of the waiting list
	* @param {object} waitingHash - Waiting list KV
	* @param {Context} context - Context instance
	* @param {testAllocationCallback} callback - callback
	*/
	testAllocation: function (lowestKey, waitingHash, context, callback) {
		var self = this; //consistent reference to this exported object
		var lowestKey = waitingHash.nextInQueue();
		var updateWaitingList = false; //whether the waiting list has changed as a result of this operation
		//check if lowestKey exists (aka someone is in front of the waiting list, waiting)
		if (lowestKey) {
			context.logger.debug("Lowest key found:");
			context.logger.debug(lowestKey);
			//make a job to test the submission of a new core/hmi
			var job = context.nomader.createJob("core-hmi-" + lowestKey);

			//get the request value for this user
			context.consuler.getKeyValue(context.keys.data.request + "/" + lowestKey, function (result) {
				if (result) {
					var request = context.UserRequest().parse(result.Value);
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
							//create a job for easy submission
							var actualJob = context.nomader.createJob("core-hmi-" + lowestKey);
							core.addCoreGroup(actualJob, lowestKey, request);
							callback(actualJob); //change for this user should happen
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
							callback(); //no change should happen
						};
					});					
				}
				else {
					//no value for the ID is in the request store... okay
					callback(); //no change should happen
				}
			});
		}
		else { //we are done: no more users in the waiting list
			context.logger.debug("No more in waiting list");
			callback(false); //no change should happen
		}
	},
	/**
	* Callback object for testAllocation
	* @callback testAllocationCallback
	* @param {object} actualJob - Object of the job file intended for submission to Nomad
	*/

	/**
	* Submits a job and pauses execution of submitting new jobs until the allocations
	* for core and HMI run
	* @param {Context} context - Context instance
	* @param {string} key - ID of a user
	* @param {waitForAllocationsCallback} callback - callback
	*/
	waitForAllocations: function (context, key, callback) {
		//confirm whether the job is running for BOTH core and hmi!
		//maximum wait of 5 seconds before we poke the nomad server again for allocation information
		var watch = context.nomader.watchAllocations("core-hmi-" + key, context.nomadAddress, 5, function (allocations) {
			//this function will be called several times. only continue when we see that the 
			//core task group and hmi task group status's state is "running". since we checked with plan that this
			//job submission will work, it should eventually end up in the "running" state (or just fail...)
			
			//make sure both allocations for core and hmi tasks exist
			if (allocations[0] && allocations[1]) {
				if (allocations[0].ClientStatus === "running" && allocations[1].ClientStatus === "running") {
					//we got what we wanted. remember to stop the watch or else bad things happen!
					watch.end();
					callback(true); //done. allocation successful
				}
				if (allocations[0].ClientStatus === "failed" || allocations[1].ClientStatus === "failed") {
					//uhoh.
					watch.end();
					callback(false); //done. allocation failed
				}
			}

		});
	},
	/**
	* Callback object for waitForAllocations
	* @callback waitForAllocationsCallback
	* @param {object} waitingHash - The new representation of the waiting list
	* @param {boolean} updateWaitingList - A boolean saying whether the waiting list has changed
	*/

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
	* @param {string} taskGroupName - Name of the task group. For logging only
	* @param {function} callback - empty callback
	*/
	submitJob: function (context, localJob, taskGroupName, callback) {
		//attempt to submit the updated job
		context.logger.debug("Submitting job for " + taskGroupName);
		localJob.submitJob(context.nomadAddress, function (result) {
			context.logger.debug(result);
			callback();
		});
	}
}
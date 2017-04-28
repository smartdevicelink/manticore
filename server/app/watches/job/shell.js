var core = require('./core.js');
var needle = require('needle');

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
			var job = context.nomader.createJob(context.strings.coreHmiJobPrefix + lowestKey);

			//get the request value for this user
			context.consuler.getKeyValue(context.keys.data.request + "/" + lowestKey, function (result) {
				if (result) {
					var request = context.UserRequest().parse(result.Value);
					core.addCoreGroup(job, lowestKey, request, context.strings);
					//make a mock HMI
					var coreServiceExample = {
						Tags: [request.getString()],
						Address: "127.0.0.1",
						Port: 3000
					};
					self.addHmiGenericGroup(context, job, 
						coreServiceExample,
						context.UserRequest().parse(coreServiceExample.Tags[0]),
						context.strings);
					//test submission!
					job.planJob(context.nomadAddress, context.strings.coreHmiJobPrefix + lowestKey, function (results) {
						var canAllocate = core.checkHasResources(results);
						if (canAllocate) {
							context.logger.debug("Core and HMI can be allocated!");
							//create a job for easy submission
							var actualJob = context.nomader.createJob(context.strings.coreHmiJobPrefix + lowestKey);
							core.addCoreGroup(actualJob, lowestKey, request, context.strings);
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
		var self = this; //consistent reference to this
		//confirm whether the job is running for BOTH core and hmi!
		//maximum wait of 5 seconds before we poke the nomad server again for allocation information
		var watch = context.nomader.watchAllocations(context.strings.coreHmiJobPrefix + key, context.nomadAddress, 5, function (allocations) {
			//this function will be called several times. only continue when we see that the 
			//core task group and hmi task group status's state is "running". since we checked with plan that this
			//job submission will work, it should eventually end up in the "running" state (or just fail...)
			
			//make sure both allocations for core and hmi tasks exist
			if (allocations[0] && allocations[1]) {
				if (allocations[0].ClientStatus === "running" && allocations[1].ClientStatus === "running") {
					//we got what we wanted. remember to stop the watch or else bad things happen!
					watch.end();
					//allocation successful
					callback(true); 
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
	* @param {object} strings - An object of string constants that come from constants.js
	*/
	addCoreGroup: function (job, userId, request, strings) {
		core.addCoreGroup(job, userId, request, strings);
	},
	/**
	* Add a task group for the generic HMI to the job file
	* @param {Context} context - Context instance
	* @param {object} job - Object of the job file intended for submission to Nomad
	* @param {object} coreService - An object from Consul that describes a service
	* @param {UserRequest} request - A single request from the request list
	* @param {object} strings - An object of string constants that come from constants.js
	*/
	addHmiGenericGroup: function (context, job, coreService, request, strings) {
		//determine what the address of the broker is here, and then pass it through the
		//addHmiGenericGroup function

		//the address to pass into the HMI will depend on whether HAProxy is used.
		var fullAddressBroker;
		if (context.config.haproxy) { //haproxy enabled
			//use the external addresses so that haproxy routes users to the HMI correctly
			fullAddressBroker = request.brokerAddressPrefix + "." + context.config.haproxy.domainName;
			if (context.config.aws && context.config.aws.elb) { //elb enabled. use secure websockets
				//override the value of haproxy port with the port that the ELB will go through
				//you should make sure the ELB exit port matches the port HAProxy is listening to
				fullAddressBroker = "wss:\\/\\/" + fullAddressBroker + ":" + context.config.aws.elb.sslPort;
			}
			else { //regular websockets
				fullAddressBroker = "ws:\\/\\/" + fullAddressBroker + ":" + context.config.haproxy.httpListen;
			}
		}
		else { //no haproxy
			//then give the HMI the internal address of core and connect that way
			//HAPROXY_OFF being true assumes everything is accessible on the same network and should only
			//be used for the ease of local development

			//we need to have backslashes because these urls will
			//be included in a regex and so we need to escape the forward slash
			fullAddressBroker = "ws:\\/\\/${NOMAD_IP_broker}:${NOMAD_HOST_PORT_broker}";
		}
		core.addHmiGenericGroup(job, coreService, request, fullAddressBroker, strings);
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
			//context.logger.debug(result);
			callback();
		});
	}
}
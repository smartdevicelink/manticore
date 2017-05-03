/** @module app/watches/job/core */

module.exports = {
	/**
	* Find a final state in which the maximum number of users are able to receive a core/hmi
	* @param {object} job - Object of the job file intended for submission to Nomad
	* @param {string} id - ID of the user
	* @param {UserRequest} request - Request list KV
	* @param {object} strings - An object of string constants that come from constants.js
	*/
	addCoreGroup: function (job, id, request, strings) {
		//this adds a group for a user so that another core will be created
		//since each group name must be different make the name based off of the user id
		//core-<id>
		var groupName = strings.coreGroupPrefix + id;
		job.addGroup(groupName);
		job.setType("service");
		//set the restart policy of core so that if it dies once, it's gone for good
		//attempts number should be 0. interval and delay don't matter since task is in fail mode
		job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");
		var taskName = strings.coreTaskPrefix + id;
		job.addTask(groupName, taskName);
		job.setImage(groupName, taskName, strings.baseImageSdlCore + strings.imageTagMaster);
		job.addPort(groupName, taskName, true, "hmi", 8087);
		job.addPort(groupName, taskName, true, "tcp", 12345);
		job.addEnv(groupName, taskName, "DOCKER_IP", "${NOMAD_IP_hmi}");
		job.addConstraint({
			LTarget: "${meta.core}",
			Operand: "=",
			RTarget: "1"
		}, groupName);
		//set resource limitations
		job.setCPU(groupName, taskName, 100);
		job.setMemory(groupName, taskName, 25);
		job.setMbits(groupName, taskName, 1);
		job.setEphemeralDisk(groupName, 50, false, false);
		job.setLogs(groupName, taskName, 2, 10);

		var serviceName = strings.coreServicePrefix + id;
		job.addService(groupName, taskName, serviceName);
		job.setPortLabel(groupName, taskName, serviceName, "hmi");
	},
	/**
	* Find a final state in which the maximum number of users are able to receive a core/hmi
	* @param {object} job - Object of the job file intended for submission to Nomad
	* @param {object} core - An object from Consul that describes an sdl_core service
	* @param {UserRequest} request - Request list KV
	* @param {string} fullAddressBroker - The address the HMI uses to connect to the broker
	* @param {object} strings - An object of string constants that come from constants.js
	*/
	addHmiGenericGroup: function (job, core, request, fullAddressBroker, strings) {
		//this adds a group for a user so that another hmi will be created
		//since each group name must be different make the name based off of the user id
		var groupName = strings.hmiGroupPrefix + request.id;
		job.addGroup(groupName);
		job.setType("service");
		var taskName = strings.hmiTaskPrefix + request.id;
		job.addTask(groupName, taskName);
		job.setImage(groupName, taskName, strings.baseImageGenericHmi + strings.imageTagMaster);
		job.addPort(groupName, taskName, true, "user", 8080);
		job.addPort(groupName, taskName, true, "broker", 9000);
		job.addConstraint({
			LTarget: "${meta.core}",
			Operand: "=",
			RTarget: "1"
		}, groupName);
		//set resource limitations
		job.setCPU(groupName, taskName, 50);
		job.setMemory(groupName, taskName, 150);
		job.setMbits(groupName, taskName, 1);
		job.setEphemeralDisk(groupName, 30, false, false);
		job.setLogs(groupName, taskName, 1, 10);
		job.addEnv(groupName, taskName, "HMI_TO_BROKER_ADDR", fullAddressBroker);
		job.addEnv(groupName, taskName, "BROKER_TO_CORE_ADDR", core.Address + ":" + core.Port);

		var serviceName = strings.hmiServicePrefix + request.id;
		job.addService(groupName, taskName, serviceName);
		job.setPortLabel(groupName, taskName, serviceName, "user");
		//add a health check
		var healthObj = {
			Type: "http",
			Name: strings.hmiAliveHealth,
			Interval: 3000000000, //in nanoseconds
			Timeout: 2000000000, //in nanoseconds
			Path: "/",
			Protocol: "http"
		}
		job.addCheck(groupName, taskName, serviceName, healthObj);
	},
	/**
	* Determines if the results say that nomad can allocate a job
	* @param {object} results - Object of the planned allocation
	* @returns {boolean} - Whether there are sufficient resources to run another core/hmi
	*/
	checkHasResources: function (results) {
		return results.FailedTGAllocs === null;
	}
}
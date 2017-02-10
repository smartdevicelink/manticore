module.exports = {
	//request is expected to be an object of type UserRequest
	addCoreGroup: function (job, id, request) {
		//this adds a group for a user so that another core will be created
		//since each group name must be different make the name based off of the user id
		//core-<id>
		var groupName = "core-" + id;
		job.addGroup(groupName);
		job.setType("batch");
		//set the restart policy of core so that if it dies once, it's gone for good
		//attempts number should be 0. interval and delay don't matter since task is in fail mode
		job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");
		job.addTask(groupName, "core-master");
		job.setImage(groupName, "core-master", "crokita/discovery-core:master");
		job.addPort(groupName, "core-master", true, "hmi", 8087);
		job.addPort(groupName, "core-master", true, "tcp", 12345);
		job.addEnv(groupName, "core-master", "DOCKER_IP", "${NOMAD_IP_hmi}");
		job.addConstraint({
			LTarget: "${meta.core}",
			Operand: "=",
			RTarget: "1"
		}, groupName);
		//set resource limitations
		job.setCPU(groupName, "core-master", 100);
		job.setMemory(groupName, "core-master", 25);
		job.setMbits(groupName, "core-master", 1);
		job.setEphemeralDisk(groupName, 50, false, false);
		job.setLogs(groupName, "core-master", 2, 10);

		job.addService(groupName, "core-master", "core-master");
		//include the id's tag for ID purposes
		//also include the user, hmi, and tcp external addresses for haproxy
		//store all this information into one tag as a stringified JSON
		//tcpPortInternal has a value because the whole object will be added as a tag to the
		//nomad job, and nomad can interpolate variables inside the tag, even as a stringified JSON
		request.tcpPortInternal = "${NOMAD_PORT_tcp}";
		job.addTag(groupName, "core-master", "core-master", request.toCoreTag());
		job.setPortLabel(groupName, "core-master", "core-master", "hmi");
	},
	//core is expected to be the object returned from consul's services API
	addHmiGenericGroup: function (job, core, haproxyPort, request) {
		//this adds a group for a user so that another hmi will be created
		//since each group name must be different make the name based off of the user id
		//hmi-<id>
		var groupName = "hmi-" + request.id;
		job.addGroup(groupName);
		job.setType("batch");
		job.addTask(groupName, "hmi-master");
		job.setImage(groupName, "hmi-master", "crokita/discovery-generic-hmi:master");
		job.addPort(groupName, "hmi-master", true, "user", 8080);
		job.addPort(groupName, "hmi-master", true, "broker", 9000);
		job.addConstraint({
			LTarget: "${meta.core}",
			Operand: "=",
			RTarget: "1"
		}, groupName);
		//set resource limitations
		job.setCPU(groupName, "hmi-master", 50);
		job.setMemory(groupName, "hmi-master", 150);
		job.setMbits(groupName, "core-master", 1);
		job.setEphemeralDisk(groupName, 30, false, false);
		job.setLogs(groupName, "hmi-master", 1, 10);
		//the address to pass into HMI will depend on whether the HAPROXY_OFF flag is on
		//by default, use the external addresses so that haproxy routes users to the HMI correctly
		//if HAPROXY_OFF is true, then give the HMI the internal address of core and connect that way
		//HAPROXY_OFF being true assumes everything is accessible on the same network and should only
		//be used for the ease of local development

		if (process.env.HAPROXY_OFF !== "true") { //haproxy enabled
			//the address from the tags is just the prefix. add the domain/subdomain name too
			var fullAddressHMI = request.hmiToCorePrefix + "." + process.env.DOMAIN_NAME;
			var fullAddressBroker = request.brokerAddressPrefix + "." + process.env.DOMAIN_NAME;
			//job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", fullAddressBroker + ":" + haproxyPort);
			//job.addEnv(groupName, "hmi-master", "BROKER_WEBSOCKET_ADDR", fullAddressHMI + ":" + haproxyPort);
			if (process.env.ELB_SSL_PORT) {
				//if an ELB SSL PORT was given, we want to use secure websockets
				//override the value of haproxyPort with the port that the ELB will go through
				//you should make sure the ELB exit port matches the port HAProxy is listening to
				job.addEnv(groupName, "hmi-master", "HMI_TO_BROKER_ADDR", fullAddressBroker + ":" + process.env.ELB_SSL_PORT);
			}
			else {
				job.addEnv(groupName, "hmi-master", "HMI_TO_BROKER_ADDR", fullAddressBroker + ":" + haproxyPort);
			}
			job.addEnv(groupName, "hmi-master", "BROKER_TO_CORE_ADDR", core.Address + ":" + core.Port);
		}
		else { //no haproxy
			//directly connect to core
			job.addEnv(groupName, "hmi-master", "HMI_TO_BROKER_ADDR", "${NOMAD_IP_broker}:${NOMAD_HOST_PORT_broker}");
			job.addEnv(groupName, "hmi-master", "BROKER_TO_CORE_ADDR", core.Address + ":" + core.Port);
			//job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", "${NOMAD_IP_broker}:${NOMAD_HOST_PORT_broker}");
			//job.addEnv(groupName, "hmi-master", "BROKER_WEBSOCKET_ADDR", core.Address + ":" + core.Port);
		
		}
		job.addService(groupName, "hmi-master", "hmi-master");
		job.setPortLabel(groupName, "hmi-master", "hmi-master", "user");
		//add a health check
		var healthObj = {
			Type: "http",
			Name: "hmi-alive",
			Interval: 3000000000, //in nanoseconds
			Timeout: 2000000000, //in nanoseconds
			Path: "/",
			Protocol: "http"
		}
		job.addCheck(groupName, "hmi-master", "hmi-master", healthObj);
		//store the port of the broker
		request.brokerPortInternal = "${NOMAD_PORT_broker}";
		//give hmi the same id as core so we know they're together	
		job.addTag(groupName, "hmi-master", "hmi-master", request.toHmiTag());
		return job;
	},
	//determines if the results say that nomad can allocate a job
	checkHasResources: function (results) {
		return results.FailedTGAllocs === null;
	}
}
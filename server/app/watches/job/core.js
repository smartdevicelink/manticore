module.exports = {
	//request is expected to be an object of type UserRequest
	addCoreGroup: function (job, id, request) {
		//this adds a group for a user so that another core will be created
		//since each group name must be different make the name based off of the user id
		//core-<id>
		var groupName = "core-group-" + id;
		job.addGroup(groupName);
		job.setType("service");
		//set the restart policy of core so that if it dies once, it's gone for good
		//attempts number should be 0. interval and delay don't matter since task is in fail mode
		job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");
		var taskName = "core-task-" + id;
		job.addTask(groupName, taskName);
		job.setImage(groupName, taskName, "crokita/discovery-core:master");
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

		var serviceName = "core-service-" + id;
		job.addService(groupName, taskName, serviceName);
		//include the id's tag for ID purposes
		//also include the user, hmi, and tcp external addresses for haproxy
		//store all this information into one tag as a stringified JSON
		//tcpPortInternal has a value because the whole object will be added as a tag to the
		//nomad job, and nomad can interpolate variables inside the tag, even as a stringified JSON
		//request.tcpPortInternal = "${NOMAD_PORT_tcp}";
		//job.addTag(groupName, taskName, serviceName, request.getString());
		job.setPortLabel(groupName, taskName, serviceName, "hmi");
	},
	//core is expected to be the object returned from consul's services API
	addHmiGenericGroup: function (job, core, request) {
		//this adds a group for a user so that another hmi will be created
		//since each group name must be different make the name based off of the user id
		var groupName = "hmi-group-" + request.id;
		job.addGroup(groupName);
		job.setType("service");
		var taskName = "hmi-task-" + request.id;
		job.addTask(groupName, taskName);
		job.setImage(groupName, taskName, "crokita/discovery-generic-hmi:manticore");
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
		//the address to pass into HMI will depend on whether the HAPROXY_OFF flag is on
		//by default, use the external addresses so that haproxy routes users to the HMI correctly
		//if HAPROXY_OFF is true, then give the HMI the internal address of core and connect that way
		//HAPROXY_OFF being true assumes everything is accessible on the same network and should only
		//be used for the ease of local development

		if (process.env.HAPROXY_OFF !== "true") { //haproxy enabled
			//the address from the tags is just the prefix. add the domain/subdomain name too
			//var fullAddressHMI = request.hmiToCorePrefix + "." + process.env.DOMAIN_NAME;
			var fullAddressBroker = request.brokerAddressPrefix + "." + process.env.DOMAIN_NAME;
			if (process.env.ELB_SSL_PORT) {
				//if an ELB SSL PORT was given, we want to use secure websockets
				//override the value of haproxy port with the port that the ELB will go through
				//you should make sure the ELB exit port matches the port HAProxy is listening to
				job.addEnv(groupName, taskName, "HMI_TO_BROKER_ADDR", "wss:\\/\\/" + fullAddressBroker + ":" + process.env.ELB_SSL_PORT);
			}
			else {
				job.addEnv(groupName, taskName, "HMI_TO_BROKER_ADDR", "ws:\\/\\/" + fullAddressBroker + ":" + process.env.HAPROXY_HTTP_LISTEN);
			}
		}
		else { //no haproxy
			//we need to have backslashes because these urls will
			//be included in a regex and so we need to escape the forward slash
			job.addEnv(groupName, taskName, "HMI_TO_BROKER_ADDR", "ws:\\/\\/${NOMAD_IP_broker}:${NOMAD_HOST_PORT_broker}");
		}
		job.addEnv(groupName, taskName, "BROKER_TO_CORE_ADDR", core.Address + ":" + core.Port);

		var serviceName = "hmi-service-" + request.id;
		job.addService(groupName, taskName, serviceName);
		job.setPortLabel(groupName, taskName, serviceName, "user");
		//add a health check
		var healthObj = {
			Type: "http",
			Name: "hmi-alive",
			Interval: 3000000000, //in nanoseconds
			Timeout: 2000000000, //in nanoseconds
			Path: "/",
			Protocol: "http"
		}
		job.addCheck(groupName, taskName, serviceName, healthObj);
		//store the port of the broker
		//request.brokerPortInternal = "${NOMAD_PORT_broker}";
		//add the hmi internal address and tcp internal address since we know that already
		//request.hmiAddressInternal = core.Address + ":" + core.Port;
		//request.tcpAddressInternal = core.Address + ":" + this.tcpPortInternal;
		//give hmi the same id as core so we know they're together	
		//job.addTag(groupName, taskName, serviceName, request.getString());
	},
	//determines if the results say that nomad can allocate a job
	checkHasResources: function (results) {
		return results.FailedTGAllocs === null;
	}
}
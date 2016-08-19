Helps with editing job files depending on available services

Plays well with consul-helper

An example for Manticore:

```
//supply a host IP address in the options array
var nomader = require('nomad-helper');
var consuler = require('consul-helper')("192.168.1.144");

//this creates an sdl core job file suitable for manticore
var jobCore = nomader.createJob("core");
jobCore.addGroup("core");
jobCore.addTask("core", "core-master");
jobCore.setImage("core", "core-master", "crokita/discovery-core:master");
jobCore.addPort("core", "core-master", true, "hmi", 8087);
jobCore.addPort("core", "core-master", true, "tcp", 12345);
jobCore.addEnv("core", "core-master", "DOCKER_IP", "${NOMAD_IP_hmi}");
jobCore.addService("core", "core-master", "core-master");
jobCore.addTag("core", "core-master", "core-master", "${NOMAD_PORT_tcp}");
jobCore.setPortLabel("core", "core-master", "core-master", "hmi");

//set up a watch so we know when the core job is actually running
consuler.watchService("core-master", function (services) {
	//services updated. get information about core and hmi if possible
	for (let i in services) {
		console.log("Core " + i + " TCP Address: " + services[i].Address + ":" + services[i].Tags[0]);
	}

	//submit a corresponding hmi job file that connects with the core service
	if (services.length > 0) {
		var jobService = services[0];
		//this creates an sdl hmi job file suitable for manticore
		var hmiCore = nomader.createJob("hmi");
		hmiCore.addGroup("hmi");
		hmiCore.addTask("hmi", "hmi-master");
		hmiCore.setImage("hmi", "hmi-master", "crokita/discovery-sdl-hmi:master");
		hmiCore.addPort("hmi", "hmi-master", true, "user", 8080);
		hmiCore.addEnv("hmi", "hmi-master", "HMI_WEBSOCKET_ADDR", jobService.Address + ":" + jobService.Port);
		hmiCore.addService("hmi", "hmi-master", "${TASKGROUP}-hmi");
		hmiCore.setPortLabel("hmi", "hmi-master", "hmi-master", "user");
		hmiCore.submitJob("192.168.1.142:4646");
	}
});

//set up a watch so we know when the hmi job is actually running
consuler.watchService("hmi-master", function (services) {
	//services updated. get information about core and hmi if possible
	for (let i in services) {
		console.log("HMI " + i + " user Address: " + services[i].Address + ":" + services[i].Port);
	}
});

//submit the core job!
jobCore.submitJob("192.168.1.142:4646");
```
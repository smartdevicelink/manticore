//the client needs an agent to connect to so that it may access consul services
//supply a host IP address in the options array
var options = {
	host: "192.168.1.144"
};
var consul = require('consul')(options); //start a consul client
var consuler = require('consul-helper');
var nomader = require('nomad-helper');
var replace = require('replace');
var needle = require('needle');
var fs = require('fs');

module.exports = function (app) {
	app.post('/cores', function (req, res) {
		startWatches();
		createCoreJob().submitJob("192.168.1.142:4646");
		res.sendStatus(200);
	});
}

function startWatches () {
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
			createHmiJob(jobService.Address, jobService.Port).submitJob("192.168.1.142:4646");
		}
	});

	//set up a watch so we know when the hmi job is actually running
	consuler.watchService("hmi-master", function (services) {
		//services updated. get information about core and hmi if possible
		for (let i in services) {
			console.log("HMI " + i + " user Address: " + services[i].Address + ":" + services[i].Port);
		}
	});
}

function createHmiJob (address, port) {
	var job = nomader.createJob("hmi");
	job.addGroup("hmi");
	job.addTask("hmi", "hmi-master");
	job.setImage("hmi", "hmi-master", "crokita/discovery-sdl-hmi:master");
	job.addPort("hmi", "hmi-master", true, "user", 8080);
	job.addEnv("hmi", "hmi-master", "HMI_WEBSOCKET_ADDR", address + ":" + port);
	job.addService("hmi", "hmi-master", "${TASKGROUP}-hmi");
	job.setPortLabel("hmi", "hmi-master", "hmi-master", "user");
	return job;
}

function createCoreJob () {
	//this creates an sdl core job file suitable for manticore
	var job = nomader.createJob("core");
	job.addGroup("core");
	job.addTask("core", "core-master");
	job.setImage("core", "core-master", "crokita/discovery-core:master");
	job.addPort("core", "core-master", true, "hmi", 8087);
	job.addPort("core", "core-master", true, "tcp", 12345);
	job.addEnv("core", "core-master", "DOCKER_IP", "${NOMAD_IP_hmi}");
	job.addService("core", "core-master", "core-master");
	job.addTag("core", "core-master", "core-master", "${NOMAD_PORT_tcp}");
	job.setPortLabel("core", "core-master", "core-master", "hmi");
	return job;
}
//the client needs an agent to connect to so that it may access consul services
//supply a host IP address
var consuler = require('consul-helper')(process.env.NOMAD_IP_http); //start a consul client
var nomader = require('nomad-helper');
var fs = require('fs');
var uuid = require('node-uuid');
var needle = require('needle');

module.exports = function (app) {
	//set up watches one time. listen forever for changes in consul's services
	startWatches();
	//start core and hmi
	app.post('/v1/cores', function (req, res) {
		//pretend we have some unique identifier for the client so that
		//we know which client wants what core
		requestCore(uuid.v4(), req.body);
		res.sendStatus(200);
	});

	//get a list of HMIs and their branches
	app.get('/v1/hmis', function (req, res) {
		let hmis = {
			hmis: [
				{
					name: "ford",
					branches: ["master", "develop"]
				},
				{
					name: "generic",
					branches: ["master"]
				}
			]
		};
		res.json(hmis);
	});

	//given an HMI, get all valid core branches
	app.get('/v1/cores/:hmiName', function (req, res) {
		//do something with req.params.hmiName
		let branches = {
			branches: [
				"master",
				"develop"
			]
		}
		res.json(branches);
	});

	//given a core branch, get all valid build configurations
	app.get('/v1/builds/:coreBranchName', function (req, res) {
		//do something with req.params.coreBranchName
		let builds = {
			builds: [
				"TIME_TESTER",
				"BUILD_BT_SUPPORT"
			]
		}
		res.json(builds);
	});

	//delete a core passing in an id
	app.delete('/v1/cores/:id', function (req, res) {
		//do something with req.params.id
		res.sendStatus(200);
	});
}

function startWatches () {
	consuler.watchKVStore("manticore", function (k) {
		//change happened
		console.log(k);
	});
	//try posting something
	consuler.setKeyValue("manticore/testing", "123");
	//set up a watch for all services
	consuler.watchServices(function (services) {
		//services updated. get information about core and hmi if possible
		let cores = services.filter("core-master");
		let hmis = services.filter("hmi-master");
		//variable that determines whether we should wait for consul to update its services
		//should be true if we submit or remove or change jobs that consul sees
		let expectChangeState = false;
		//for every core service, ensure it has a corresponding HMI. If it doesn't have one, make one
		for (let i = 0; i < cores.length; i++) {
			let foundHmi = false;
			for (let j = 0; j < hmis.length; j++) {
				//0 index has the uuid for both jobs
				if (cores[i].Tags[0] === hmis[j].Tags[0]) {
					j = hmis.length; //there is a match. okay
					foundHmi = true;
				}
			}
			if (!foundHmi) {
				//make a new HMI job
				//this creates an sdl hmi job file suitable for manticore
				//pass in the uuid, which should be the first tag
				createHmiJob(cores[i].Address, cores[i].Port, cores[i].Tags[0]).submitJob(process.env.NOMAD_IP_http + ":4646");
				expectChangeState = true;
			}
		}
		//now check all HMIs. if they don't have a paired core, destroy it
		
		for (let i = 0; i < hmis.length; i++) {
			let foundCore = false;
			for (let j = 0; j < cores.length; j++) {
				//0 index has the uuid for both jobs
				if (hmis[i].Tags[0] === cores[j].Tags[0]) {
					foundCore = true; //match. okay
					j = cores.length;
				}
				if (!foundCore) {
					//remove. not done yet. sh
				}
			}
		}

		//if we expect the services to be updated then we expect this function to be called again
		//with updated info. so don't do anything
		if (!expectChangeState) {
			//this should be the newest info. return connection information about the instance
			//back to the user
			if (cores.length > 0 && hmis.length > 0) {
				var body = {
					tcpAddress: cores[0].Address + ":" + cores[0].Tags[1],
					hmiAddress: hmis[0].Address + ":" + hmis[0].Port
				}
				needle.post('192.168.1.142:3000/v1/address', body, function (err, res) {
					//nothing
				});
			}



		}
		//services updated. get information about core and hmi if possible
		/*for (let i = 0; i < hmis.length; i++) {
			console.log("Core " + i + " TCP Address: " + cores[i].Address + ":" + cores[i].Tags[1]);
			console.log("HMI " + i + " user Address: " + hmis[i].Address + ":" + hmis[i].Port);
		}*/
	});
}

function createHmiJob (address, port, uuid) {
	var job = nomader.createJob("hmi");
	job.addGroup("hmi");
	job.addTask("hmi", "hmi-master");
	job.setImage("hmi", "hmi-master", "crokita/discovery-sdl-hmi:master");
	job.addPort("hmi", "hmi-master", true, "user", 8080);
	job.addEnv("hmi", "hmi-master", "HMI_WEBSOCKET_ADDR", address + ":" + port);
	job.addService("hmi", "hmi-master", "hmi-master");
	job.setPortLabel("hmi", "hmi-master", "hmi-master", "user");
	//give hmi the same uuid as core so we know they're together
	job.addTag("hmi", "hmi-master", "hmi-master", uuid);
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
	//generate a unique id for each service for pairing purposes
	job.addTag("core", "core-master", "core-master", uuid.v4());
	job.addTag("core", "core-master", "core-master", "${NOMAD_PORT_tcp}");
	job.setPortLabel("core", "core-master", "core-master", "hmi");
	return job;
}

function requestCore (uuid, body) {
	console.log(uuid);
	console.log(body);
	//store the uuid in the database so that the response back
	//will be directed towards the user making the request
	createCoreJob().submitJob(process.env.NOMAD_IP_http + ":4646");
}
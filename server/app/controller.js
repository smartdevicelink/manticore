//the client needs an agent to connect to so that it may access consul services
//supply a host IP address
var consuler = require('consul-helper')(process.env.NOMAD_IP_http); //start a consul client
var nomader = require('nomad-helper');
var fs = require('fs');
var uuid = require('node-uuid');
var needle = require('needle');
var nomadAddress = process.env.NOMAD_IP_http + ":4646"

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

function requestCore (userId, body) {
	//store the userId and request info in the database. wait for this app to find it
	consuler.setKeyValue("manticore/" + userId, JSON.stringify(body));
}

function startWatches () {
	//set a watch for the KV store
	consuler.watchKVStore("manticore", function (keys) {
		//all the keys are users waiting for a core and hmi
		//attempt to be the first to create the job and submit it to Nomad
		var job = nomader.createJob("core");
		var keysTotal = keys.length;
		for (let i = 0; i < keys.length; i++) {
			let key = keys[i];
			consuler.getKeyValue(key, function (value) {
				//the value is actually an object. extract the information
				var request = JSON.parse(value.Value);
				//we'll need this information eventually. but not now
				addCoreGroup(job, parseKvUserId(key));
				keysTotal--;
				if (keysTotal === 0) { //no more keys to parse through
					//submit the job
					job.submitJob(nomadAddress, function (){});
				}
			});
		}		
	});

	//set up a watch for all services
	consuler.watchServices(function (services) {
		//services updated. get information about core and hmi if possible
		let cores = services.filter("core-master");
		let hmis = services.filter("hmi-master");
		//variable that determines whether we should wait for consul to update its services
		//should be true if we submit or remove or change jobs that consul sees
		let expectChangeState = false;
		//for every core service, ensure it has a corresponding HMI
		var job = nomader.createJob("hmi");
		for (let i = 0; i < cores.length; i++) {
			//pass in the id of core, which should be the first tag
			//also pass in the is repesenting the user in order to name the service
			addHmiGroup(job, cores[i].Address, cores[i].Port, cores[i].Tags[1], cores[i].Tags[0]);
		}
		//submit the job
		job.submitJob(nomadAddress, function () {});

		//for each HMI found, find its paired core, determine who that core belongs to, 
		//and send the connection information to the owner
		//we search through HMIs because HMIs depend on cores, and there could be a core
		//but no paired HMI yet
		for (let i = 0; i < hmis.length; i++) {
			var corePair = undefined;
			for (let j = 0; j < hmis.length; j++) {
				//check if there is a pair using the internal id (not the user id in the group name)
				if (hmis[i].Tags[0] === cores[i].Tags[0]) {
					corePair = cores[i];
					j = hmis.length; //break out of the loop
				}
			}
			if (corePair) {
				//parse the name of the service to get just the user id
				var body = {
					user: hmis[i].Tags[1],
					tcpAddress: corePair.Address + ":" + corePair.Tags[2],
					hmiAddress: hmis[i].Address + ":" + hmis[i].Port
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

//remove "manticore/" from key in store to get user id
function parseKvUserId (userId) {
	var indexOfHyphen = userId.indexOf("/");
	return userId.substr(indexOfHyphen + 1);
}

function addHmiGroup (job, address, port, userId, coreId) {
	//this adds a group for a user so that another hmi will be created
	//since each group name must be different make the name based off of the user id
	//hmi-<userId>
	var groupName = "hmi-" + userId;
	job.addGroup(groupName);
	job.addTask(groupName, "hmi-master");
	job.setImage(groupName, "hmi-master", "crokita/discovery-sdl-hmi:master");
	job.addPort(groupName, "hmi-master", true, "user", 8080);
	job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", address + ":" + port);
	job.addService(groupName, "hmi-master", "hmi-master");
	job.setPortLabel(groupName, "hmi-master", "hmi-master", "user");
	//give hmi the same id as core so we know they're together
	//also include the userId's tag
	job.addTag(groupName, "hmi-master", "hmi-master", coreId);
	job.addTag(groupName, "hmi-master", "hmi-master", userId);
	return job;
}

function addCoreGroup (job, userId) {
	//this adds a group for a user so that another core will be created
	//since each group name must be different make the name based off of the user id
	//core-<userId>
	var groupName = "core-" + userId;
	job.addGroup(groupName);
	job.addTask(groupName, "core-master");
	job.setImage(groupName, "core-master", "crokita/discovery-core:master");
	job.addPort(groupName, "core-master", true, "hmi", 8087);
	job.addPort(groupName, "core-master", true, "tcp", 12345);
	job.addEnv(groupName, "core-master", "DOCKER_IP", "${NOMAD_IP_hmi}");
	job.addService(groupName, "core-master", "core-master");
	//generate a unique id for each service for pairing purposes
	//also include the userId's tag
	job.addTag(groupName, "core-master", "core-master", uuid.v4());
	job.addTag(groupName, "core-master", "core-master", userId);
	job.addTag(groupName, "core-master", "core-master", "${NOMAD_PORT_tcp}");
	job.setPortLabel(groupName, "core-master", "core-master", "hmi");
}
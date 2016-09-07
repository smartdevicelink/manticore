//functionality of manticore without asynchronous behavior nor dependencies for unit testing
var nomader = require('nomad-helper');
var uuid = require('node-uuid');

module.exports = {
	expect: function (callbackNumber, callback) {
		let count = callbackNumber;

		var job = nomader.createJob("core");
		return {
			send: function (key, value) {
				count--;
				//the value is actually an object. extract the information
				var request = JSON.parse(value.Value);
				//we'll need this information eventually. but not now
				addCoreGroup(job, parseKvUserId(key));
				if (count === 0) { //no more keys to parse through
					//submit the job by invoking the function passed in
					callback(job);
				}
			}
		}
	},
	findPairs: function (cores, hmis) {
		//for each HMI found, find its paired core, determine who that core belongs to, 
		//and send the connection information to the owner
		//we search through HMIs because HMIs depend on cores, and there could be a core
		//but no paired HMI yet
		var pairs = [];
		for (let i = 0; i < hmis.length; i++) {
			let corePair = undefined;
			for (let j = 0; j < cores.length; j++) {
				//check if there is a pair using the internal id (not the user id in the group name)
				if (hmis[i].Tags[0] === cores[j].Tags[0]) {
					corePair = cores[j];
					j = cores.length; //break out of the loop
				}
			}
			if (corePair) {
				//parse the name of the service to get just the user id
				let body = {
					user: hmis[i].Tags[1],
					tcpAddress: corePair.Address + ":" + corePair.Tags[2],
					hmiAddress: hmis[i].Address + ":" + hmis[i].Port
				}
				pairs.push(body);
			}
		}
		return pairs;
	},
	addHmiGroup: addHmiGroup
}

//remove "manticore/" from key in store to get user id
function parseKvUserId (userId) {
	var indexOfHyphen = userId.indexOf("/");
	return userId.substr(indexOfHyphen + 1);
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
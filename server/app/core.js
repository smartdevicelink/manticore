//functionality of manticore without asynchronous behavior nor dependencies for unit testing
var fs = require('fs');
var nginx = require('./NginxTemplate.js');
var nomader = require('nomad-helper');
var ip = require('ip');
var config = require('../config.js');

module.exports = {
	expect: function (callbackNumber, callback) {
		let count = callbackNumber;

		var job = nomader.createJob("core");
		return {
			send: function (key, value) {
				count--;
				//the value is actually an object. extract the information
				var request = JSON.parse(value.Value);
				addCoreGroup(job, parseKvUserId(key), request);
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
				//check if there is a pair using the user id
				if (hmis[i].Tags[0] === cores[j].Tags[0]) {
					corePair = cores[j];
					j = cores.length; //break out of the loop
				}
			}
			if (corePair) {
				//parse the name of the service to get just the user id
				//the pair should have the same userId as the first tag string
				let body = {
					user: hmis[i].Tags[0],
					userAddressInternal: hmis[i].Address + ":" + hmis[i].Port,
					hmiAddressInternal: corePair.Address + ":" + corePair.Port,
					tcpAddressInternal: corePair.Address + ":" + corePair.Tags[1],
					userAddressExternal: corePair.Tags[2],
					hmiAddressExternal: corePair.Tags[3],
					tcpAddressExternal: corePair.Tags[4]
				}
				pairs.push(body);
			}
		}
		return pairs;
	},
	addHmiGroup: addHmiGroup,
	generateNginxFile: function (pairs) {
		var pairs = pairs.pairs;
		//for each pair, extract connection information and add them to nginx config file
		var file = nginx();
		file.server(3000, true, null, ip.address() + ":4000", false); //manticore web server of this machine
		for (let i = 0; i < pairs.length; i++) {
			let pair = pairs[i];
			file.server(3000, false, pair.userAddressExternal, pair.userAddressInternal, false) //route user to hmi
				.server(3000, false, pair.hmiAddressExternal, pair.hmiAddressInternal, true) //route hmi to core (websocket)
				.server(3000, false, pair.tcpAddressExternal, pair.tcpAddressInternal, false); //route user app to core
		}
		return file.get();
	},
	getUniqueString: function (blackList, generatorFunc) {
		//use generatorFunc to keep creating new strings until
		//there is one that isn't part of the blackList, and return it
		var str = generatorFunc();
		while (blackList.find(checkList)) {
			str = generatorFunc();
		}
		return str;
		function checkList (item) {
			return str === item;
		}
	},
	getAddressesFromUserRequests: function (keys) {
		var addresses = [];
		if (keys !== undefined) {
			for (let i = 0; i < keys.length; i++) {
				let value = JSON.parse(keys[i].Value);
				addresses.push(value.userToHmiPrefix);
				addresses.push(value.hmiToCorePrefix);
				addresses.push(value.userToCorePrefix);
			}
		}
		return addresses;
	}
}

//remove "manticore/" from key in store to get user id
function parseKvUserId (userId) {
	var indexOfHyphen = userId.indexOf("/");
	return userId.substr(indexOfHyphen + 1);
}

function addCoreGroup (job, userId, request) {
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
	//include the userId's tag for ID purposes
	//also include the user, hmi, and tcp external addresses for nginx
	job.addTag(groupName, "core-master", "core-master", userId);
	job.addTag(groupName, "core-master", "core-master", "${NOMAD_PORT_tcp}");
	job.addTag(groupName, "core-master", "core-master", request.userToHmiPrefix);
	job.addTag(groupName, "core-master", "core-master", request.hmiToCorePrefix);
	job.addTag(groupName, "core-master", "core-master", request.userToCorePrefix);
	job.setPortLabel(groupName, "core-master", "core-master", "hmi");
}

function addHmiGroup (job, address, port, userId) {
	//this adds a group for a user so that another hmi will be created
	//since each group name must be different make the name based off of the user id
	//hmi-<userId>
	var groupName = "hmi-" + userId;
	job.addGroup(groupName);
	job.addTask(groupName, "hmi-master");
	job.setImage(groupName, "hmi-master", "crokita/discovery-sdl-hmi:master");
	job.addPort(groupName, "hmi-master", true, "user", 8080);
	//the address from the tags is just the prefix. add the domain/subdomain name too
	var fullAddress = address + "." + config.domainName;
	job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", fullAddress + ":" + port);
	job.addService(groupName, "hmi-master", "hmi-master");
	job.setPortLabel(groupName, "hmi-master", "hmi-master", "user");
	//give hmi the same id as core so we know they're together
	job.addTag(groupName, "hmi-master", "hmi-master", userId);
	return job;
}
//functionality of manticore without asynchronous behavior nor dependencies for unit testing
var fs = require('fs');
var nginx = require('./NginxTemplate.js');
var nomader = require('nomad-helper');
var ip = require('ip');
var logger = require('../lib/logger');

module.exports = {
	expect: function (callbackNumber, callback) {
		let count = callbackNumber;

		var job = nomader.createJob("core");
		if (count === 0) { //is 0 is passed in, callback immediately
			callback(job); 
		}
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
	findPairs: function (cores, hmis, callback) {
		//for each HMI found, find its paired core, determine who that core belongs to, 
		//and send the connection information to the owner
		//we search through HMIs because HMIs depend on cores, and there could be a core
		//but no paired HMI yet
		var pairs = [];
		for (let i = 0; i < hmis.length; i++) {
			let corePair = undefined;
			let hmiTagObj = JSON.parse(hmis[i].Tags[0]);
			for (let j = 0; j < cores.length; j++) {
				//check if there is a pair using the user id
				let coreTagObj = JSON.parse(cores[j].Tags[0]);
				if (hmiTagObj.userId === coreTagObj.userId) {
					corePair = cores[j];
					j = cores.length; //break out of the loop
				}
			}
			if (corePair) {
				//parse the name of the service to get just the user id
				//the pair should have the same userId as the first tag string
				let coreTagObj = JSON.parse(corePair.Tags[0]);
				let body = {
					user: hmiTagObj.userId,
					userAddressInternal: hmis[i].Address + ":" + hmis[i].Port,
					hmiAddressInternal: corePair.Address + ":" + corePair.Port,
					tcpAddressInternal: corePair.Address + ":" + coreTagObj.tcpPort,
					userAddressExternal: coreTagObj.userToHmiPrefix,
					hmiAddressExternal: coreTagObj.hmiToCorePrefix,
					tcpAddressExternal: coreTagObj.userToCorePrefix
				}
				pairs.push(body);
			}
			else {
				//an HMI doesn't have a corresponding core
				//cores are made first, then corresponding HMIs
				//this means that core has died while the two were connected
				//should only happen if the user disconnected from the webpage and the
				//shutdown signal was sent from HMI to core to kill it
				//interpret this as the user being done with the pair and send back
				//the id of the user from the request to be removed from the KV store
				logger.debug("HMI with no core. Stop serving " + hmiTagObj.userId);
				if (typeof callback === "function") {
					callback(hmiTagObj.userId);
				}
			}
		}
		return pairs;
	},
	addHmisToJob: function (job, cores) {
		for (let i = 0; i < cores.length; i++) {
			//pass in what is repesenting the user in order to name the service
			//pass in the external address prefix of core so that when the user tries to connect to it
			//from outside the network nginx can route that IP address to the correct internal one
			addHmiGenericGroup(job, cores[i], 3000);
		}	
	},
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
	},
	checkNginxFlag: function (nginxOnFunc, nginxOffFunc) {
		//invoke the callback function only if NGINX_OFF is not set to "true"
		if (process.env.NGINX_OFF !== "true") {
			nginxOnFunc();
		}
		else {
			nginxOffFunc();
		}
	},
	checkJobs: function (job, jobsFunc, noJobsFunc) {
		//invoke the noJobsFunc function only if there are no task groups in TaskGroups
		if (job.getJob().Job.TaskGroups.length === 0) {
			noJobsFunc();
		}
		else { //there are task groups. call jobsFunc
			jobsFunc();
		}
	},
	filterKeys: function (keys, targetString) {
		//remove all keys that do not contain the targetString
		keys = keys.filter(containTest);
		return keys;
		function containTest (element) {
			return element.includes(targetString);
		}
	},
	parseKvUserId: parseKvUserId,
	getWsUrl: function () {
		if (process.env.NGINX_OFF !== "true") { //nginx enabled
			return "http://" + ip.address() + ":" + process.env.HTTP_PORT;
		}
		else { //no nginx
			return "http://localhost:" + process.env.HTTP_PORT;
		}
	}
}

function parseKvUserId (userId) {
	var userIdParts = userId.split("manticore/requests/");
	return userIdParts.join("");
}

function addCoreGroup (job, userId, request) {
	//this adds a group for a user so that another core will be created
	//since each group name must be different make the name based off of the user id
	//core-<userId>
	var groupName = "core-" + userId;
	job.addGroup(groupName);
	//set the restart policy of core so that if it dies once, it's gone for good
	//attempts number should be 0. interval and delay don't matter since task is in fail mode
	job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");
	job.addTask(groupName, "core-master");
	job.setImage(groupName, "core-master", "crokita/discovery-core:master");
	job.addPort(groupName, "core-master", true, "hmi", 8087);
	job.addPort(groupName, "core-master", true, "tcp", 12345);
	job.addEnv(groupName, "core-master", "DOCKER_IP", "${NOMAD_IP_hmi}");
	job.addService(groupName, "core-master", "core-master");
	//include the userId's tag for ID purposes
	//also include the user, hmi, and tcp external addresses for nginx
	//store all this information into one tag as a stringified JSON
	var obj = {
		userId: userId,
		tcpPort: "${NOMAD_PORT_tcp}",
		userToHmiPrefix: request.userToHmiPrefix,
		hmiToCorePrefix: request.hmiToCorePrefix,
		userToCorePrefix: request.userToCorePrefix
	};
	job.addTag(groupName, "core-master", "core-master", JSON.stringify(obj));
	job.setPortLabel(groupName, "core-master", "core-master", "hmi");
}

function addHmiGenericGroup (job, core, nginxPort) {
	//parse the JSON from the tag
	var tagObj = JSON.parse(core.Tags[0]);

	//this adds a group for a user so that another hmi will be created
	//since each group name must be different make the name based off of the user id
	//hmi-<userId>
	var groupName = "hmi-" + tagObj.userId;
	job.addGroup(groupName);
	job.addTask(groupName, "hmi-master");
	job.setImage(groupName, "hmi-master", "crokita/discovery-generic-hmi:master");
	job.addPort(groupName, "hmi-master", true, "user", 8080);

	//the address to pass into HMI will depend on whether the NGINX_OFF flag is on
	//by default, use the external addresses so that nginx routes users to the HMI correctly
	//if NGINX_OFF is true, then give the HMI the internal address of core and connect that way
	//NGINX_OFF being true assumes everything is accessible on the same network and should only
	//be used for the ease of local development

	if (process.env.NGINX_OFF !== "true") { //nginx enabled
		//the address from the tags is just the prefix. add the domain/subdomain name too
		var fullAddress = tagObj.hmiToCorePrefix + "." + process.env.DOMAIN_NAME;
		job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", fullAddress + ":" + nginxPort);
	}
	else { //no nginx
		//directly connect to core
		job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", core.Address + ":" + core.Port);
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

	//give hmi the same id as core so we know they're together
	var obj = {
		userId: tagObj.userId
	};
	
	job.addTag(groupName, "hmi-master", "hmi-master", JSON.stringify(obj));
	return job;
}
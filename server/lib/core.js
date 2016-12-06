//functionality of manticore without asynchronous behavior nor dependencies for unit testing
var fs = require('fs');
var haproxy = require('./HAProxyTemplate.js');
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
	//generalized version of expect()
	expectation: function (count, callback) {
		check();
		return {
			send: function () {
				count--;
				check();
			}
		}
		function check () {
			if (count === 0) {
				callback();
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
					tcpAddressInternal: corePair.Address + ":" + coreTagObj.tcpPortInternal,
					userAddressExternal: coreTagObj.userToHmiPrefix,
					hmiAddressExternal: coreTagObj.hmiToCorePrefix,
					tcpPortExternal: coreTagObj.tcpPortExternal
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
			//from outside the network haproxy can route that IP address to the correct internal one
			addHmiGenericGroup(job, cores[i], process.env.HAPROXY_HTTP_LISTEN);
		}	
	},
	generateProxyData: function (pairs, manticores) {
		var pairs = pairs.pairs;
		//for each pair, extract connection information and add them to HAProxy config file
		//put TCP blocks in a separate file
		var file = haproxy();
		file.setMainPort(process.env.HAPROXY_HTTP_LISTEN);

		for (let i = 0; i < manticores.length; i++) {
			var manticore = manticores[i];
			file.addWebAppAddress(manticore.Address + ":" + manticore.Port);
		}

		//generate a number of unique ports equal to the number of pairs
		//add the routes routes
		for (let i = 0; i < pairs.length; i++) {
			//generate a random port number in a range specified by environment variables
			//to pick as an exposed port for a TCP connection
			let pair = pairs[i];
			file.addHttpRoute(pair.userAddressExternal, pair.userAddressInternal)
				.addHttpRoute(pair.hmiAddressExternal, pair.hmiAddressInternal)
				.addTcpRoute(pair.tcpPortExternal, pair.tcpAddressInternal)
		}
		return file;
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
			}
		}
		return addresses;
	},
	getPortsFromUserRequests: function (keys) {
		var ports = [];
		if (keys !== undefined) {
			for (let i = 0; i < keys.length; i++) {
				let value = JSON.parse(keys[i].Value);
				ports.push(value.tcpPortExternal);
			}
		}
		return ports;
	},
	checkHaProxyFlag: function (proxyOnFunc, proxyOffFunc) {
		//invoke the callback function only if HAPROXY_OFF is not set to "true"
		if (process.env.HAPROXY_OFF !== "true") {
			proxyOnFunc();
		}
		else {
			proxyOffFunc();
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
	transformKeys: function (keys, targetString, isArrayOfStrings) {
		//remove all keys that do not contain the targetString
		/* set isArrayOfStrings to false if the keys are in this format:
		{
			Key: ...
			Value: ...
		}
		set isArrayOfStrings to true if the keys are in this format:
		["key1", "key2", "key3",...]
		*/
		
		if (isArrayOfStrings) {
			var filtered = keys.filter(function (element) {
				return element.includes(targetString);
			});
			//now trim the prefixes of the filtered keys using the targetString
			for (let i = 0; i < filtered.length; i++) {
				filtered[i] = filtered[i].split(targetString + "/")[1];
			}
			return filtered;
		}
		else {
			var filtered = keys.filter(function (element) {
				return element.Key.includes(targetString);
			});
			//now trim the prefixes of the filtered keys using the targetString
			for (let i = 0; i < filtered.length; i++) {
				filtered[i].Key = filtered[i].Key.split(targetString + "/")[1];
			}
			//additionally, convert the array of KV objects into an object hash
			var KV = {};
			for (let i = 0; i < filtered.length; i++) {
				KV[filtered[i].Key] = filtered[i].Value;
			}
			return KV;
		}

	},
	parseKvUserId: parseKvUserId,
	getWsUrl: function () {
		if (process.env.HAPROXY_OFF === "true") { //no haproxy
			return "http://localhost:" + process.env.HTTP_PORT;	
		}
		else { //haproxy enabled
			return "http://" + process.env.DOMAIN_NAME + ":3000";
		}
	},
	findAliveCoreAllocation: function (allocations, targetID) {
		for (let i = 0; i < allocations.length; i++) {
			//remove "core-" from taskgroup name to get just the ID
			var testID = allocations[i].TaskGroup.split("core-")[1];
			if (testID === targetID) {
				//only return the alloc ID if the ClientStatus is set to "running"
				if (allocations[i].ClientStatus === "running") {
					return allocations[i];
				}
			}
		}
		return null; //return null if nothing matches
	},
	handleAllocation: function (allocation, userId, callback) {
		//TODO: getWsUrl is incorrect. in local development mode you should get
		//the address of the manticore server that is handling the request. check allocation
		//for information and use that instead
		logger.debug(JSON.stringify(allocation, null, 4));
		//point the user to the appropriate address
		var address = this.getWsUrl();
		//use the userId to generate a unique ID intended for the socket connection
		logger.debug("Connection ID Generated:" + userId);
		var connectionInfo = null;

		if (allocation === null) {
			//core isn't available to stream logs
			logger.debug("Core isn't available for streaming for connection ID " + userId);
		}
		else {
			//we can stream logs! return the appropriate connection details
			//pass back the address and connectionID to connect to the websocket server
			connectionInfo = {
				url: address,
				connectionId: userId
			}
			logger.debug("Sending connection information to user " + userId);
			logger.debug("Address: " + connectionInfo.url);
			logger.debug("Connection ID: " + connectionInfo.connectionId);
			var taskName; //get the task name
			for (var obj in allocation.TaskStates) {
				taskName = obj;
				break;
			}
			callback(taskName); //send the taskName back too
		}
		return connectionInfo;
	},
	//returns an array of unique numbers within a specified range
	getUniquePort: getUniquePort,
	oneAtATime: oneAtATime,
	checkUniqueRequest: function (userId, requests, callback) {
		if (requests === undefined) {
			requests = [];
		}
		//callback only if there is no request with the given id found in the KV store
		for (let i = 0; i < requests.length; i++) {
			if (requests[i].Key === userId) {
				logger.debug("Duplicate request from " + userId);
				return;
			}
		}
		//made it to the end of the loop. callback
		callback();
	},
	updateWaitingList: function (requests, waitingData, claimedData) {
		//find the highest index in the waiting list (last in line)
		var highestIndex = 0;
		for (var key in waitingData) {
			var index = waitingData[key];
			if (index > highestIndex) {
				highestIndex = index;
			} 
		}
		//check if each request is in the waiting list OR claimed list
		for (let i = 0; i < requests.length; i++) {
			if (waitingData[requests[i]] === undefined && claimedData[requests[i]] === undefined) {
				//request not in waiting/claimed list. add it with a value of the highest number in the
				//list to indicate a last position in line
				waitingData[requests[i]] = highestIndex + 1;
				//we have a new highest index
				highestIndex++;
			}
		}
		//now check if each request in the waiting list OR claimed list exists in the requests
		//if it doesn't, remove it
		var combinedData = {};
		for (var key in waitingData) {
			combinedData[key] = waitingData[key];
		}
		for (var key in claimedData) {
			combinedData[key] = claimedData[key];
		}
		for (var key in combinedData) {
			if (requests.indexOf(key) === -1) {//not found. remove from waiting list
				delete waitingData[key];
			}
		}
		//return updated waiting list.
		return waitingData;
	},
	//send back the key with the lowest index. if there are no keys, don't send back anything
	findLowestIndexedKey: function (obj, callback) {
		var lowestIndex = Infinity;
		var lowestKey = null;
		for (var key in obj) {
			var value = obj[key];
			if (value < lowestIndex) {
				lowestIndex = value;
				lowestKey = key;
			}
		}
		if (lowestKey) {
			callback(lowestKey);			
		}
	},
	addCoreGroup: addCoreGroup,
	addHmiGenericGroup: addHmiGenericGroup,
	filterObjectKeys: function (obj, compareObj) {
		//keep an object if the key is found in the comparing object
		var filtered = {};
		for (var key in obj) {
			if (compareObj[key] !== undefined) {
				filtered[key] = obj[key];
			}
		}
		return filtered;
	}
}

function oneAtATime (accept, stop) {
	//add a requests property to this function object that keeps track of 
	//this function being invoked
	var self = oneAtATime;
	if (self.requests === undefined) { //initialize
		self.requests = 0;
	}
	self.requests++; //this function will attempt to execute
	if (self.requests > 1) { //this function is already being executed and isn't done yet. stop
		return;
	}
	//this function is the only one executing. invoke the callback and prevent this function
	//from executing again
	accept(function () { 
		//a "done" function. when this gets invoked, this function is done executing
		//if there are additional requests that have happened in the time this was executing
		//then invoke oneAtATime again
		if (self.requests > 1) {
			self.requests = 0;
			oneAtATime(accept, stop);
		}
		else { //this function is done being invoked
			self.requests = 0;
			stop();
		}
	});
}

//warning: may be slow
//computation time proportional to <possibilityNumber> * <blackList.length>
function getUniquePort (lowerBound, upperBound, blackList) {
	var possibilityNumber = upperBound - lowerBound + 1;
	if (upperBound < lowerBound) {
		throw "Upper bound is less than lower bound";
	}
	//when mass generating numbers like these, don't leave it up to probability to find a unique number
	//generate all possible numbers and remove elements based on the blacklist
	var possibilities = [];
	for (let i = lowerBound; i <= upperBound; i++) {
		possibilities.push(i);
	}
	//remove blacklist numbers
	possibilities = possibilities.filter(function (num) {
		return blackList.indexOf(num) === -1;
	});
	if (possibilities.length === 0) {
		//no possible number can be made
		throw "No possible number can be created given the blacklist";
	}
	var randomIndex = Math.floor(Math.random()*possibilities.length);
	return possibilities[randomIndex];
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
	//include the userId's tag for ID purposes
	//also include the user, hmi, and tcp external addresses for haproxy
	//store all this information into one tag as a stringified JSON
	var obj = {
		userId: userId,
		tcpPortInternal: "${NOMAD_PORT_tcp}",
		userToHmiPrefix: request.userToHmiPrefix,
		hmiToCorePrefix: request.hmiToCorePrefix,
		tcpPortExternal: request.tcpPortExternal
	};
	job.addTag(groupName, "core-master", "core-master", JSON.stringify(obj));
	job.setPortLabel(groupName, "core-master", "core-master", "hmi");
}

function addHmiGenericGroup (job, core, haproxyPort) {
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
		var fullAddress = tagObj.hmiToCorePrefix + "." + process.env.DOMAIN_NAME;
		job.addEnv(groupName, "hmi-master", "HMI_WEBSOCKET_ADDR", fullAddress + ":" + haproxyPort);
	}
	else { //no haproxy
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
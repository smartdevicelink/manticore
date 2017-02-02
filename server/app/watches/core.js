module.exports = {
	//converts Consul key/values into hashes with trimmed key names
	//also filter keys that match the targetString passed in
	transformKeys: function (keys, targetString) {
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
	},
	//WARNING: assumes that the taskgroups are in order!
	compareJobStates: function (job1, job2) {
		var infoChanged = false;

		//first check how many task groups are in each job
		var jobCount1 = 0;
		var jobCount2 = 0;

		if (job1 && job1.getJob().Job && job1.getJob().Job.TaskGroups) {
			jobCount1 = job1.getJob().Job.TaskGroups.length;
		}
		if (job2 && job2.getJob().Job && job2.getJob().Job.TaskGroups) {
			jobCount2 = job2.getJob().Job.TaskGroups.length;
		}

		if (jobCount1 !== jobCount2) {
			infoChanged = true; //task group count isn't the same
		}
		else if (jobCount1 !== 0 && jobCount2 !== 0) {
			//we may not be able to access TaskGroups if either task group count is 0
			//this if statement protects this method
			var groups1 = job1.getJob().Job.TaskGroups;
			var groups2 = job2.getJob().Job.TaskGroups;
			for (let i = 0; i < groups1.length; i++) {
				if (groups1[i].Name !== groups2[i].Name) {
					infoChanged = true;
				}
			}
			for (let i = 0; i < groups2.length; i++) {
				if (groups2[i].Name !== groups1[i].Name) {
					infoChanged = true;
				}
			}					
		}

		return infoChanged;
	},
	findPairs: function (cores, hmis, callback) {
		//for each HMI found, find its paired core, determine who that core belongs to, 
		//and send the connection information to the owner
		//we search through HMIs because HMIs depend on cores, and there could be a core
		//but no paired HMI yet
		var pairs = [];
		for (let i = 0; i < hmis.length; i++) {
			let corePair = undefined;
			let corePairTagRequest = undefined;
			let hmiTagRequest = hmis[i].Tags[0];
			for (let j = 0; j < cores.length; j++) {
				//check if there is a pair using the user id
				let coreTagRequest = cores[j].Tags[0];
				if (hmiTagRequest.id === coreTagRequest.id) {
					corePair = cores[j];
					corePairTagRequest = coreTagRequest;
					j = cores.length; //break out of the loop
				}
			}
			if (corePair) {
				//parse the name of the service to get just the user id
				//the pair should have the same id as the first tag string
				let body = corePairTagRequest.generatePairInfo(corePair, hmis[i]);
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
				if (typeof callback === "function") {
					callback(hmiTagRequest.id);
				}
			}
		}
		return pairs;
	},
	//convert a JSON pair object to something more usable
	formatPairResponse: function (pair) {
		var userAddress;
		var hmiAddress;
		var tcpAddress;
		var brokerAddress;
		if (pair.userAddressExternal) {
			userAddress = pair.userAddressExternal + "." + process.env.DOMAIN_NAME;
		}
		else {
			userAddress = pair.userAddressInternal;
		}

		if (pair.hmiAddressExternal) {
			hmiAddress = pair.hmiAddressExternal + "." + process.env.DOMAIN_NAME;
		}
		else {
			hmiAddress = pair.hmiAddressInternal;
		}

		if (pair.tcpPortExternal) {
			tcpAddress = process.env.DOMAIN_NAME + ":" + pair.tcpPortExternal;
		}
		else {
			tcpAddress = pair.tcpAddressInternal;
		}

		if (pair.brokerAddressExternal) {
			brokerAddress = pair.brokerAddressExternal + "." + process.env.DOMAIN_NAME;
		}
		else {
			brokerAddress = pair.brokerAddressInternal;
		}
		return {
			userAddress: userAddress,
			hmiAddress: hmiAddress,
			tcpAddress: tcpAddress,
			brokerAddress: brokerAddress
		}
	}
}
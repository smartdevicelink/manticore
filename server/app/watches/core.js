/** @module app/watches/core */

module.exports = {
	/**
	* Determine which watches should be created and which should be destroyed
	* @param {currentWatchesArray} currentWatches - Array of watch keys that are the names of the services
	* @param {array} services - Array of Consul services of cores and HMIs
	* @param {function} stopper - Function which passes a service name to the caller to stop the service watch 
	* @param {function} starter - Function which passes a service name to the caller to start the service watch 
	*/
	updateWatches: function (currentWatchesArray, services, stopper, starter) {
		//first, remove watches that shouldn't exist anymore
		//let the caller function handle how to remove/start the watches
		for (let i = 0 ; i < currentWatchesArray.length; i++) {
			if (services.indexOf(currentWatchesArray[i]) === -1) {
				stopper(currentWatchesArray[i]);
			}
		}
		//start watches that aren't in currentWatchesArray but are in services
		for (let i = 0 ; i < services.length; i++) {
			if (currentWatchesArray.indexOf(services[i]) === -1) {
				starter(services[i]);
			}
		}
	},
	/**
	* Converts Consul key/values into hashes with trimmed key names
	* Also filter keys that match the targetString passed in
	* @param {array} keys - Array of full path strings in the KV store for an ID
	* @param {string} targetString - The string used to filter the keys with and to trim the keys with
	* @returns {object} - KV object which maps all IDs to each of their request values found in the KV store
	*/
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
	/**
	* Convert a JSON pair object into a more standard format
	* @param {object} pair - Object full of address information for cores and HMIs. No documented format 
	* @returns {object} - KV object which describes all addresses a user needs to use core/hmi. No documented format
	*/	
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
			if (process.env.ELB_SSL_PORT) {
				brokerAddress += ":" + process.env.ELB_SSL_PORT;
			}
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
	},
	/**
	* Filters services out with failed healh checks
	* @param {array} services - Array of service objects from Consul's service watches
	* @param {array} mandatoryChecks - An array of strings, where each string is the name of a health check required to pass
	* @returns {array} - Array of service objects, filtered
	*/	
	filterServices: function (services, mandatoryChecks) {
	    var servicesArr = [];
	    for (let i = 0; i < services.length; i++) {
	        //parse through the information
	        //make sure all health checks are passing to count this service
            var healthReqs = services[i].Checks;
            if (this.healthCheckService(healthReqs, mandatoryChecks)) {
        		servicesArr.push(services[i].Service);
            }
	    }
	    return servicesArr;
	},
	/**
	* Ensures that all health checks that exist pass. A service will fail if the
	* check does not exist in the service health object
	* @param {array} healthCheckArr - Array of service checks that currently exist and their statuses
	* @param {array} mandatoryChecks - An array of strings, where each string is the name of a health check required to pass
	* @returns {boolean} - Whether this service is healthy
	*/	
	healthCheckService: function (healthCheckArr, mandatoryChecks) {
		if (!mandatoryChecks) {
			mandatoryChecks = [];
		}

		var requiredChecks = {};
		//make a to-do list of required checks
		for (let i = 0; i < mandatoryChecks.length; i++) {
			requiredChecks[mandatoryChecks[i]] = false;
		}

	    for (let i = 0; i < healthCheckArr.length; i++) {
	        if (healthCheckArr[i].Status !== "passing") {
	            return false;
	        }
	        var stringName = healthCheckArr[i].Name;
	        //check passed. check if it was one of our mandatory checks
	        if (requiredChecks[stringName] !== undefined) {
	        	requiredChecks[stringName] = true;
	        }
	    }
	    //ensure all mandatory checks have passed
	    for (var key in requiredChecks) {
	    	if (!requiredChecks[key]) {
	    		return false;
	    	}
	    }
	    return true;
	}
}
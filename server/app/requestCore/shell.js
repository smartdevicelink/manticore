var core = require('./core.js');
var randomString = require('randomstring');

module.exports = {
	//ensures that the user with the given id isn't already in the KV store
	checkUniqueRequest: function (id, context, callback) {
		//get all keys in the request list
		context.consuler.getKeyAll(context.keys.data.request + "/", function (results) {
			var isUnique = core.checkUniqueRequest(context.keys.data.request + "/" + id, results);
			callback(isUnique, results);
		});
	},
	addExternalAddresses: function (requestJSON, requestsKV) {
		//get current addresses from all users
		var usedAddresses = core.parseAddressesFromUserRequests(requestsKV);
		var usedPorts = core.getTcpPortsFromUserRequests(requestsKV);

		var options1 = {
			length: 12,
			charset: 'alphanumeric',
			capitalization: 'lowercase'
		}
		//generate random prefixes for addresses
		var func1 = randomString.generate.bind(undefined, options1);
		const userToHmiAddress = core.getUniqueString(usedAddresses, func1); //userAddress prefix
		const hmiToCoreAddress = core.getUniqueString(usedAddresses, func1); //hmiAddress prefix
		const brokerAddress = core.getUniqueString(usedAddresses, func1); //brokerAddress prefix

		//since we must have one TCP port open per connection to SDL core (it's a long story)
		//generate a number within reasonable bounds and isn't already used by other core connections
		//WARNING: this does not actually check if the port is used on the OS! please make sure the
		//port range specified in the environment variables are all open!
		const tcpPortExternal = core.getUniquePort(process.env.TCP_PORT_RANGE_START, 
			process.env.TCP_PORT_RANGE_END, usedPorts);
		
		//attach the new addresses to the request object
		requestJSON.userToHmiPrefix = userToHmiAddress;
		requestJSON.hmiToCorePrefix = hmiToCoreAddress;
		requestJSON.tcpPortExternal = tcpPortExternal;
		requestJSON.brokerAddressPrefix = brokerAddress;
		return;
	},
	storeRequestInKVStore: function (requestJSON, context) {
		context.consuler.setKeyValue(context.keys.data.request + "/" + requestJSON.id, requestJSON.getString());
	}
}
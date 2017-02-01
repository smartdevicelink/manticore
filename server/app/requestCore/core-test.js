var mocha = require('mocha');
var assert = require('assert');
var core = require('./core.js');
var UserRequest = require('../../lib/UserRequest.js');

describe("#checkUniqueRequest()", function () {
	it("should return true if the id is not in the requests array", function () {
		var id = "1234";
		var requests = [
			{Key: "4242"},
			{Key: "3561"},
			{Key: "6442"},
			{Key: "6480"}
		];

		var result = core.checkUniqueRequest(id, requests);
		assert.strictEqual(result, true);
	});
	it("should return false if the id is in the requests array", function () {
		var id = "1234";
		var requests = [
			{Key: "4242"},
			{Key: "3561"},
			{Key: "1234"},
			{Key: "6480"}
		];

		var result = core.checkUniqueRequest(id, requests);
		assert.strictEqual(result, false);
	});
});

describe("#parseAddressesFromUserRequests()", function () {
	it("should retrieve all address prefixes from all keys in manticore", function () {
		var request1 = UserRequest().generateDataInitial();
		var request2 = UserRequest().generateDataInitial();

		var testData = [{
			LockIndex: 0,
			Key: 'manticore/1234567890abcdef',
			Flags: 0,
			Value: request1.getString()
		},
		{
			LockIndex: 0,
			Key: 'manticore/1234567890abcdef',
			Flags: 0,
			Value: request2.getString()
		}];
		var addresses = core.parseAddressesFromUserRequests(testData);
		assert(addresses.length === 6, "there are 6 addresses. found " + addresses.length);
		assert(addresses[0] === request1.userToHmiPrefix);
		assert(addresses[1] === request1.hmiToCorePrefix);
		assert(addresses[2] === request1.brokerAddressPrefix);
		assert(addresses[3] === request2.userToHmiPrefix);
		assert(addresses[4] === request2.hmiToCorePrefix);
		assert(addresses[5] === request2.brokerAddressPrefix);
	});
});

describe("#getUniqueString()", function () {
	it("should return a four digit string", function () {
		function randomGenerator () {
			return "1234";
		}
		var string = core.getUniqueString([], randomGenerator);
		assert(string === "1234", "string is a 4 digit string. Got " + string);
	});
	it("should return a new string if the first one was in the blacklist", function () {
		var funcIndex = 1210;
		function randomGenerator () {
			let result = "" + funcIndex;
			funcIndex++;
			return result;
		}
		var string = core.getUniqueString(["1210", "1211"], randomGenerator);
		assert(string === "1212", "string is 1212. Got " + string);
	});
});

describe("#getUniquePort()", function () {
	it("should throw if the parameters are invalid", function () {
		var didThrow = false;
		try {
			var result = core.getUniquePort(3, 1, []);
		}
		catch (err) {
			didThrow = true;
		}
		assert.equal(didThrow, true);
	});

	it("should throw if you request for more unique numbers than possible given the blacklist", function () {
		var didThrow = false;
		try {
			var result = core.getUniquePort(2, 4, [2,5,6,4,2,3]);
		}
		catch (err) {
			didThrow = true;
		}
		assert.equal(didThrow, true);
	});

	it("should return a unique number", function () {
		var result = core.getUniquePort(13, 15, [14, 15]);
		assert.equal(result, 13);
	});
});

describe("#getTcpPortsFromUserRequests()", function () {
	it("should retrieve all TCP ports from all keys in manticore", function () {
		var request1 = UserRequest().generateDataInitial();
		var request2 = UserRequest().generateDataInitial();

		var testData = [{
			LockIndex: 0,
			Key: 'manticore/1234567890abcdef',
			Flags: 0,
			Value: request1.getString()
		},
		{
			LockIndex: 0,
			Key: 'manticore/1234567890abcdef',
			Flags: 0,
			Value: request2.getString()
		}];
		var addresses = core.getTcpPortsFromUserRequests(testData);
		assert(addresses.length === 2, "there are 2 ports. found " + addresses.length);
		assert(addresses[0] === request1.tcpPortExternal);
		assert(addresses[1] === request2.tcpPortExternal);
	});
});



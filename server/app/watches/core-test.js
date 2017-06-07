var mocha = require('mocha');
var assert = require('assert');
var core = require('./core.js');
var UserRequest = require('../../lib/UserRequest.js');
var nomader = require('nomad-helper');

describe("#updateWatches()", function () {
	it ("should invoke stopper if a watch shouldn't exist anymore", function () {
		var currentWatches = ["2", "3"];
		var newServices = ["2"];
		core.updateWatches(currentWatches, newServices,
		function (serviceName) {
			assert.strictEqual(serviceName, "3");
		},
		function (serviceName) {
			assert.fail(undefined, undefined, "starter function shouldn't have been invoked", undefined);
		});
	});
	it ("should invoke starter if a watch should exist", function () {
		var currentWatches = ["1"];
		var newServices = ["1", "4"];
		core.updateWatches(currentWatches, newServices,
		function (serviceName) {
			assert.fail(undefined, undefined, "stopper function shouldn't have been invoked", undefined);
		},
		function (serviceName) {
			assert.strictEqual(serviceName, "4");
		});
	});
});

describe("#transformKeys()", function () {
	it("should include keys that contain the target string (keys from recursive get all)", function () {
		var targetString = "requests";
		var keys = [
			{Key: "requests/1234", Value: "k"},
			{Key: "requests/13hb", Value: "i"},
			{Key: "filler", Value: "l"},
			{Key: "requests/abcd", Value: "s"}
		];
		keys = core.transformKeys(keys, targetString);
		assert.equal(keys["1234"], "k");
		assert.equal(keys["13hb"], "i");
		assert.equal(keys["abcd"], "s");
	});
});


describe("#formatPairResponse()", function () {
	it("should convert a JSON pair object to another, more parsable JSON object (internal)", function () {
		var pair = {
			id: 761, 
			userAddressInternal: "192.168.1.77:24826", 
			hmiAddressInternal: "192.168.1.77:36379", 
			tcpAddressInternal: "192.168.1.77:35218", 
			brokerAddressInternal: "192.168.1.77:23612", 
			userAddressExternal: undefined, 
			hmiAddressExternal: undefined, 
			tcpPortExternal: undefined, 
			brokerAddressExternal: undefined
		}
		var formatted = core.formatPairResponse(pair);
		assert.strictEqual(formatted.userAddress, pair.userAddressInternal);
		assert.strictEqual(formatted.hmiAddress, pair.hmiAddressInternal);
		assert.strictEqual(formatted.tcpAddress, pair.tcpAddressInternal);
		assert.strictEqual(formatted.brokerAddress, pair.brokerAddressInternal);
	});

	it("should convert a JSON pair object to another, more parsable JSON object (external, ELB)", function () {
		var domainName = "manticore.com";
		var haproxyListen = "80";
		var elbSslPort = "444";
		var pair = {
			id: 761, 
			userAddressInternal: "192.168.1.77:24826", 
			hmiAddressInternal: "192.168.1.77:36379", 
			tcpAddressInternal: "192.168.1.77:35218", 
			brokerAddressInternal: "192.168.1.77:23612", 
			userAddressExternal: "asdf", 
			hmiAddressExternal: "zxcv", 
			tcpPortExternal: "qwer", 
			brokerAddressExternal: "12345"
		}
		var formatted = core.formatPairResponse(pair, domainName, haproxyListen, elbSslPort);
		assert.strictEqual(formatted.userAddress, pair.userAddressExternal + "." + domainName);
		assert.strictEqual(formatted.hmiAddress, pair.hmiAddressExternal + "." + domainName);
		assert.strictEqual(formatted.tcpAddress, domainName + ":" + pair.tcpPortExternal);
		assert.strictEqual(formatted.brokerAddress, pair.brokerAddressExternal + "." + domainName + ":" + elbSslPort);
	});

	it("should convert a JSON pair object to another, more parsable JSON object (external, no ELB)", function () {
		var domainName = "manticore.com";
		var haproxyListen = "80";
		var elbSslPort = undefined;
		var pair = {
			id: 761, 
			userAddressInternal: "192.168.1.77:24826", 
			hmiAddressInternal: "192.168.1.77:36379", 
			tcpAddressInternal: "192.168.1.77:35218", 
			brokerAddressInternal: "192.168.1.77:23612", 
			userAddressExternal: "asdf", 
			hmiAddressExternal: "zxcv", 
			tcpPortExternal: "qwer", 
			brokerAddressExternal: "12345"
		}
		var formatted = core.formatPairResponse(pair, domainName, haproxyListen, elbSslPort);
		assert.strictEqual(formatted.userAddress, pair.userAddressExternal + "." + domainName);
		assert.strictEqual(formatted.hmiAddress, pair.hmiAddressExternal + "." + domainName);
		assert.strictEqual(formatted.tcpAddress, domainName + ":" + pair.tcpPortExternal);
		assert.strictEqual(formatted.brokerAddress, pair.brokerAddressExternal + "." + domainName + ":" + haproxyListen);
	});
});

describe("#filterServices()", function () {
	it("should return false if one of the health checks are in critical state", function () {
		var serviceObj = [{ 
			Service: { 
				Service: 'hmi-master',
				Tags: [ '{"id":"732","brokerPortInternal":"36879"}' ],
				Address: '192.168.1.77',
				Port: 50736,
				EnableTagOverride: false,
				CreateIndex: 1200,
				ModifyIndex: 1202 
			},
			Checks: [
				{ 
					Name: 'hmi-alive',
					Status: 'passing',
					ServiceName: 'wat'
				},
				{ 
					Name: 'Serf Health Status',
					Status: 'passing',
					ServiceName: 'wat'
				} 
			]
		}];

        var filterResults = core.filterServices(serviceObj, ['hmi-alive']);
        assert.strictEqual(filterResults[0], serviceObj[0].Service);
	});
});

describe("#healthCheckService()", function () {
	it("should return false if one of the health checks are in critical state", function () {
		var checkResults = [
			{ 
		       Name: 'hmi-alive',
		       Status: 'critical',
		       ServiceName: 'wat',
		    },
		    { 
		       Name: 'Serf Health Status',
		       Status: 'passing',
		       ServiceName: 'wat',
		    } 
        ];
        var healthy = core.healthCheckService(checkResults, []);
        var healthy2 = core.healthCheckService(checkResults, ['hmi-alive']);
        var healthy3 = core.healthCheckService(checkResults, ['Serf Health Status']);
        assert.strictEqual(healthy, false);
	});
	it("should return false if one of the mandatory checks don't exist", function () {
		var checkResults = [
			{ 
		       Name: 'hmi-alive',
		       Status: 'passing',
		       ServiceName: 'wat',
		    },
		    { 
		       Name: 'Serf Health Status',
		       Status: 'passing',
		       ServiceName: 'wat',
		    } 
        ];
        var healthy = core.healthCheckService(checkResults, ['test-http']);
        assert.strictEqual(healthy, false);
	});
	it("should return true if all checks pass and all mandatory checks exist", function () {
		var checkResults = [
			{ 
		       Name: 'hmi-alive',
		       Status: 'passing',
		       ServiceName: 'wat',
		    },
		    { 
		       Name: 'Serf Health Status',
		       Status: 'passing',
		       ServiceName: 'wat',
		    } 
        ];
        var healthy = core.healthCheckService(checkResults, ['hmi-alive']);
        assert.strictEqual(healthy, true);
	});
});

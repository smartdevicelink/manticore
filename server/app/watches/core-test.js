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

describe("#checkTaskCount()", function () {
	it("should return the number of taskgroups found", function () {
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

describe("#compareJobStates()", function () {
	it("should return false if both jobs are null or have 0 task groups", function () {
		var job1 = null;
		var job2 = null;

		var result = core.compareJobStates(job1, job2);
		assert.equal(result, false);

		job1 = nomader.createJob("test");

		result = core.compareJobStates(job1, job2);
		assert.equal(result, false);

		job2 = nomader.createJob("test2");

		result = core.compareJobStates(job1, job2);
		assert.equal(result, false);

		job1 = null;

		result = core.compareJobStates(job1, job2);
		assert.equal(result, false);
	});

	it("should return false if both jobs have the same task group names", function () {
		//warning: the task groups must be in the same order!
		var job1 = nomader.createJob("test");
		job1.addGroup("testing123");
		job1.addGroup("testing234");
		job1.addGroup("testing987");

		var job2 = nomader.createJob("test2");
		job2.addGroup("testing123");
		job2.addGroup("testing234");
		job2.addGroup("testing987");

		var result = core.compareJobStates(job1, job2);
		assert.equal(result, false);
	});

	it("should return true if both jobs have different task group names", function () {
		//warning: the task groups must be in the same order!
		var job1 = nomader.createJob("test");
		job1.addGroup("testing123");
		job1.addGroup("testing234");
		job1.addGroup("testing987");

		var job2 = nomader.createJob("test2");

		var result = core.compareJobStates(job1, job2);
		assert.equal(result, true);

		job2.addGroup("testing123");

		result = core.compareJobStates(job1, job2);
		assert.equal(result, true);

		job2.addGroup("testing234");

		result = core.compareJobStates(job1, job2);
		assert.equal(result, true);

		job2.addGroup("testing111");
		result = core.compareJobStates(job1, job2);
		assert.equal(result, true);
	});
});

describe("#findPairs()", function () {
	it("should return an empty array if no pairs are found", function () {
		let coreTagObj = new UserRequest().generateDataCore();
		coreTagObj.id = "userId";
		let hmiTagObj = new UserRequest().generateDataHmi();
		hmiTagObj.id = "userId2";

		var cores = [{
			Address: "127.0.0.1",
			Tags: [JSON.stringify(coreTagObj)]
		}];
		var hmis = [{
			Address: "127.0.0.1",
			Port: "8687",
			Tags: [JSON.stringify(hmiTagObj)]
		}];
		//first, convert the tag string for all cores and hmis into UserRequest objects
		for (let i = 0; i < hmis.length; i++) {
			hmis[i].Tags[0] = UserRequest().parse(hmis[i].Tags[0]);
		}
		for (let i = 0; i < cores.length; i++) {
			cores[i].Tags[0] = UserRequest().parse(cores[i].Tags[0]);
		}	
		var pairs = core.findPairs(cores, hmis);
		assert(pairs.length === 0, "There are no pairs. Found " + pairs.length);
	});

	//use this data for the next two tests
	let coreTagObj1 = new UserRequest().generateDataCore();
	coreTagObj1.id = "userId1";
	coreTagObj1.tcpPortInternal = "44300";
	coreTagObj1.tcpPortExternal = "12522";
	coreTagObj1.userToHmiPrefix = "userToHmi1";
	coreTagObj1.hmiToCorePrefix = "hmiToCore1";
	coreTagObj1.brokerAddressPrefix = "broker1";

	let coreTagObj2 = new UserRequest().generateDataCore();
	coreTagObj2.id = "userId3";
	coreTagObj2.tcpPortInternal = "12345";
	coreTagObj2.tcpPortExternal = "27486";
	coreTagObj2.userToHmiPrefix = "userToHmi2";
	coreTagObj2.hmiToCorePrefix = "hmiToCore2";
	coreTagObj2.brokerAddressPrefix = "broker2";

	let coreTagObj3 = new UserRequest().generateDataCore();
	coreTagObj3.id = "userId2";
	coreTagObj3.tcpPortInternal = "25252";
	coreTagObj3.tcpPortExternal = "88888";
	coreTagObj3.userToHmiPrefix = "userToHmi3";
	coreTagObj3.hmiToCorePrefix = "hmiToCore3";
	coreTagObj3.brokerAddressPrefix = "broker3";

	let hmiTagObj1 = new UserRequest().generateDataHmi();
	hmiTagObj1.id = "userId1";
	hmiTagObj1.brokerPortInternal = "9901";

	let hmiTagObj2 = new UserRequest().generateDataHmi();
	hmiTagObj2.id = "userId2";
	hmiTagObj2.brokerPortInternal = "9902";

	let hmiTagObj3 = new UserRequest().generateDataHmi();
	hmiTagObj3.id = "userId4";
	hmiTagObj3.brokerPortInternal = "9903";

	let cores = [{
		Address: "127.0.0.1",
		Port: "1211",
		Tags: [JSON.stringify(coreTagObj1)]
	},
	{
		Address: "127.0.0.2",
		Port: "1212",
		Tags: [JSON.stringify(coreTagObj2)]
	},
	{
		Address: "127.0.0.3",
		Port: "1213",
		Tags: [JSON.stringify(coreTagObj3)]
	}];
	let hmis = [{
		Address: "127.0.0.4",
		Port: "8687",
		Tags: [JSON.stringify(hmiTagObj1)]
	},
	{
		Address: "127.0.0.5",
		Port: "1234",
		Tags: [JSON.stringify(hmiTagObj2)]
	},
	{
		Address: "127.0.0.6",
		Port: "2345",
		Tags: [JSON.stringify(hmiTagObj3)]
	}];
	//first, convert the tag string for all cores and hmis into UserRequest objects
	for (let i = 0; i < hmis.length; i++) {
		hmis[i].Tags[0] = UserRequest().parse(hmis[i].Tags[0]);
	}
	for (let i = 0; i < cores.length; i++) {
		cores[i].Tags[0] = UserRequest().parse(cores[i].Tags[0]);
	}	
	it("should return 2 pairs that are found", function () {
		var pairs = core.findPairs(cores, hmis);
		assert(pairs.length === 2, "There are 2 pairs. Found " + pairs.length);
		assert(pairs[0].id === "userId1");
		assert(pairs[0].tcpAddressInternal === "127.0.0.1:44300");
		assert(pairs[0].hmiAddressInternal === "127.0.0.1:1211");
		assert(pairs[0].userAddressInternal === "127.0.0.4:8687");
		assert(pairs[0].brokerAddressInternal === "127.0.0.4:9901");
		assert(pairs[0].userAddressExternal === "userToHmi1");
		assert(pairs[0].hmiAddressExternal === "hmiToCore1");
		assert(pairs[0].tcpPortExternal === "12522");

		assert(pairs[1].id === "userId2");
		assert(pairs[1].tcpAddressInternal === "127.0.0.3:25252");
		assert(pairs[1].hmiAddressInternal === "127.0.0.3:1213");
		assert(pairs[1].userAddressInternal === "127.0.0.5:1234");
		assert(pairs[1].brokerAddressInternal === "127.0.0.5:9902");
		assert(pairs[1].userAddressExternal === "userToHmi3");
		assert(pairs[1].hmiAddressExternal === "hmiToCore3");
		assert(pairs[1].tcpPortExternal === "88888");
	});

	it("should invoke callback for every HMI not paired with core", function (done) {
		var pairs = core.findPairs(cores, hmis, function (id) {
			assert(id === "userId4", "userId4 has no core pair. Found " + id);
			done();
		});

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

	it("should convert a JSON pair object to another, more parsable JSON object (external)", function () {
		process.env.DOMAIN_NAME = "manticore.com";
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
		var formatted = core.formatPairResponse(pair);
		assert.strictEqual(formatted.userAddress, pair.userAddressExternal + "." + process.env.DOMAIN_NAME);
		assert.strictEqual(formatted.hmiAddress, pair.hmiAddressExternal + "." + process.env.DOMAIN_NAME);
		assert.strictEqual(formatted.tcpAddress, process.env.DOMAIN_NAME + ":" + pair.tcpPortExternal);
		assert.strictEqual(formatted.brokerAddress, pair.brokerAddressExternal + "." + process.env.DOMAIN_NAME);
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


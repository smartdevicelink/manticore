var mocha = require('mocha');
var assert = require('assert');
var core = require('../lib/core.js');
var nomader = require('nomad-helper');
var functionite = require('functionite');
var UserRequest = require('../lib/UserRequest.js');

describe("#expectation()", function () {
	it("should return an object with a send function to invoke", function () {
		var expecting = core.expectation(3, function(){});
		assert(typeof expecting.send === "function", "send is a function. Found " + (typeof expecting.send))
	});
	it("should invoke the callback after the send function is called 3 times", function (done){

		var expecting = core.expectation(3, function () {
			done();
		});
		expecting.send();
		expecting.send();
		expecting.send();
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

describe("#getAddressesFromUserRequests()", function () {
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
		var addresses = core.getAddressesFromUserRequests(testData);
		assert(addresses.length === 6, "there are 6 addresses. found " + addresses.length);
		assert(addresses[0] === request1.userToHmiPrefix);
		assert(addresses[1] === request1.hmiToCorePrefix);
		assert(addresses[2] === request1.brokerAddressPrefix);
		assert(addresses[3] === request2.userToHmiPrefix);
		assert(addresses[4] === request2.hmiToCorePrefix);
		assert(addresses[5] === request2.brokerAddressPrefix);
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

describe("#generateProxyData()", function () {
	it("should generate proxy data meant for HTTP and for TCP proxying", function () {
		var testData = {
			pairs: [{
				user: "3456789yduc2nj3f",
				userAddressInternal: "127.0.0.1:4000",
				hmiAddressInternal: "127.0.0.1:5000",
				tcpAddressInternal: "127.0.0.1:6000",
				brokerAddressInternal: "127.0.0.1:7000",
				userAddressExternal: "15uyh6176",
				hmiAddressExternal: "a4a4y43yq53",
				tcpPortExternal: "2742",
				brokerAddressExternal: "9999"
			}]
		};
		var manticoreData = [{
			Address: "test:2000",
			Port: 20
		}];
		var file = core.generateProxyData(testData, manticoreData);
		assert.equal(file.webAppAddresses.length, 1);
		assert.equal(file.webAppAddresses[0], manticoreData[0].Address + ":" + manticoreData[0].Port);
		assert.equal(file.tcpMaps.length, 1);
		assert.equal(file.tcpMaps[0].port, testData.pairs[0].tcpPortExternal);
		assert.equal(file.tcpMaps[0].to, testData.pairs[0].tcpAddressInternal);
		assert.equal(file.httpMaps.length, 3);
		assert.equal(file.httpMaps[0].from, testData.pairs[0].userAddressExternal);
		assert.equal(file.httpMaps[0].to, testData.pairs[0].userAddressInternal);
		assert.equal(file.httpMaps[1].from, testData.pairs[0].hmiAddressExternal);
		assert.equal(file.httpMaps[1].to, testData.pairs[0].hmiAddressInternal);
		assert.equal(file.httpMaps[2].from, testData.pairs[0].brokerAddressExternal);
		assert.equal(file.httpMaps[2].to, testData.pairs[0].brokerAddressInternal);
	});

});

describe("#addHmisToJob()", function () {
	it("should create an hmi job based on the core job when HAPROXY_OFF isn't true", function () {
		process.env.HAPROXY_OFF = "";
		process.env.HAPROXY_HTTP_LISTEN = 3000;
		var coreRequest1 = UserRequest().generateDataCore();
		coreRequest1.id = "userId1";
		coreRequest1.tcpPort = "44300";
		coreRequest1.userToHmiPrefix = "userToHmi1";
		coreRequest1.hmiToCorePrefix = "hmiToCore1";
		coreRequest1.brokerAddressPrefix = "broker1";

		var coreRequest2 = UserRequest().generateDataCore();
		coreRequest2.id = "userId3";
		coreRequest2.tcpPort = "12345";
		coreRequest2.userToHmiPrefix = "userToHmi2";
		coreRequest2.hmiToCorePrefix = "hmiToCore2";
		coreRequest2.brokerAddressPrefix = "broker2";

		var job = nomader.createJob("hmi");
		var cores = [{
			Address: "127.0.0.1",
			Port: "1211",
			Tags: [coreRequest1.getString()]
		},
		{
			Address: "127.0.0.2",
			Port: "1212",
			Tags: [coreRequest2.getString()]
		}];
		core.addHmisToJob(job, cores);
		//check env and id in tag for each hmi task
		var env1a = job.findTask("hmi-userId1", "hmi-master").Env.HMI_WEBSOCKET_ADDR;
		var env1b = job.findTask("hmi-userId1", "hmi-master").Env.BROKER_WEBSOCKET_ADDR;
		var env2a = job.findTask("hmi-userId3", "hmi-master").Env.HMI_WEBSOCKET_ADDR;
		var env2b = job.findTask("hmi-userId3", "hmi-master").Env.BROKER_WEBSOCKET_ADDR;

		var tag1 = job.findTask("hmi-userId1", "hmi-master").Services[0].Tags[0];
		var tag2 = job.findTask("hmi-userId3", "hmi-master").Services[0].Tags[0];
		assert.equal(env1a, "hmiToCore1." + process.env.DOMAIN_NAME + ":" + process.env.HAPROXY_HTTP_LISTEN);
		assert.equal(env1b, "broker1." + process.env.DOMAIN_NAME + ":" + process.env.HAPROXY_HTTP_LISTEN);
		assert.equal(env2a, "hmiToCore2." + process.env.DOMAIN_NAME + ":" + process.env.HAPROXY_HTTP_LISTEN);
		assert.equal(env2b, "broker2." + process.env.DOMAIN_NAME + ":" + process.env.HAPROXY_HTTP_LISTEN);
		assert.equal(JSON.parse(tag1).id, JSON.parse(cores[0].Tags[0]).id);
		assert.equal(JSON.parse(tag2).id, JSON.parse(cores[1].Tags[0]).id);
	});

	it("should create an hmi job based on the core job when HAPROXY_OFF is true", function () {
		process.env.HAPROXY_OFF = "true";
		var coreRequest1 = UserRequest().generateDataCore();
		coreRequest1.id = "userId1";
		coreRequest1.tcpPort = "44300";
		coreRequest1.userToHmiPrefix = "userToHmi1";
		coreRequest1.hmiToCorePrefix = "hmiToCore1";
		coreRequest1.brokerAddressPrefix = "broker1";

		var coreRequest2 = UserRequest().generateDataCore();
		coreRequest2.id = "userId3";
		coreRequest2.tcpPort = "12345";
		coreRequest2.userToHmiPrefix = "userToHmi2";
		coreRequest2.hmiToCorePrefix = "hmiToCore2";
		coreRequest2.brokerAddressPrefix = "broker2";

		var job = nomader.createJob("hmi");
		var cores = [{
			Address: "127.0.0.1",
			Port: "1211",
			Tags: [coreRequest1.getString()]
		},
		{
			Address: "127.0.0.2",
			Port: "1212",
			Tags: [coreRequest2.getString()]
		}];
		core.addHmisToJob(job, cores);
		//check env and userId in tag for each hmi task
		var env1a = job.findTask("hmi-userId1", "hmi-master").Env.HMI_WEBSOCKET_ADDR;
		var env1b = job.findTask("hmi-userId1", "hmi-master").Env.BROKER_WEBSOCKET_ADDR;
		var env2a = job.findTask("hmi-userId3", "hmi-master").Env.HMI_WEBSOCKET_ADDR;
		var env2b = job.findTask("hmi-userId3", "hmi-master").Env.BROKER_WEBSOCKET_ADDR;
		var tag1 = job.findTask("hmi-userId1", "hmi-master").Services[0].Tags[0];
		var tag2 = job.findTask("hmi-userId3", "hmi-master").Services[0].Tags[0];
		assert.equal(env1a, "${NOMAD_IP_broker}:${NOMAD_HOST_PORT_broker}");
		assert.equal(env1b, cores[0].Address+":"+cores[0].Port);
		assert.equal(env2a, "${NOMAD_IP_broker}:${NOMAD_HOST_PORT_broker}");
		assert.equal(env2b, cores[1].Address+":"+cores[1].Port);
		assert.equal(JSON.parse(tag1).id, JSON.parse(cores[0].Tags[0]).id);
		assert.equal(JSON.parse(tag2).id, JSON.parse(cores[1].Tags[0]).id);
	});
});

describe("#checkHaProxyFlag()", function () {
	it("should invoke the first function if HAPROXY_OFF is not set to 'true' as an env variable", function (done) {
		process.env.HAPROXY_OFF = ""; //force it
		core.checkHaProxyFlag(function () {
			done();
		}, function () {
			assert.fail(null, null, "The first function should've been called");
		});
	});
	it("should invoke the second function if HAPROXY_OFF is set to 'true' as an env variable", function (done) {
		process.env.HAPROXY_OFF = "true"; //force it
		core.checkHaProxyFlag(function () {
			assert.fail(null, null, "The second function should've been called");
		}, function () {
			done();
		});
	});
});

describe("#checkJobs()", function () {
	it("should invoke the first function if there are tasks in TaskGroups", function (done) {
		var job = nomader.createJob("test");
		job.addGroup("test-group");
		core.checkJobs(job, function () {
			done();
		}, function () {
			assert.fail(null, null, "The first function should've been called");
		});
	});

	it("should invoke the second function if there are no tasks in TaskGroups", function (done) {
		var job = nomader.createJob("test");
		core.checkJobs(job, function () {
			assert.fail(null, null, "The second function should've been called");
		}, function () {
			done();
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

describe("#getWsUrl()", function () {
	it("should return domain name if HAPROXY_OFF is not set to 'true' as an env variable (with HTTPS)", function () {
		process.env.HAPROXY_OFF = ""; //force it
		process.env.HAPROXY_HTTP_LISTEN = 7777;
		var address = core.getWsUrl();
		assert.equal(address, "//" + process.env.DOMAIN_NAME);
	});
	it("should return localhost if HAPROXY_OFF is set to 'true' as an env variable", function () {
		process.env.HAPROXY_OFF = "true"; //force it
		process.env.NOMAD_IP_http = "127.0.0.1";
		process.env.NOMAD_HOST_PORT_http = 32000;
		var address = core.getWsUrl();
		assert.equal(address, `http://${process.env.NOMAD_IP_http}:${process.env.NOMAD_HOST_PORT_http}`);
	});
});

describe("#findAliveCoreAllocation()", function () {
	it("should return null if no ID matches", function () {
		var id = "12345";
		var allocations = [{
			ID: "234710237512",
			TaskGroup: "core-15515",
			ClientStatus: "running"
		},{
			ID: "12312361163",
			TaskGroup: "core-24242",
			ClientStatus: "running"
		},{
			ID: "8425245674",
			TaskGroup: "core-35782",
			ClientStatus: "running"
		}];
		var result = core.findAliveCoreAllocation(allocations, id);
		assert.equal(result, null);
	});
	it("should return null if there's no matching ID that is also running", function () {
		var id = "35782";
		var allocations = [{
			ID: "234710237512",
			TaskGroup: "core-15515",
			ClientStatus: "complete"
		},{
			ID: "12312361163",
			TaskGroup: "core-24242",
			ClientStatus: "running"
		},{
			ID: "8425245674",
			TaskGroup: "core-35782",
			ClientStatus: "complete"
		}];
		var result = core.findAliveCoreAllocation(allocations, id);
		assert.equal(result, null);
	});

	it("should return a match if an ID matches", function () {
		var id = "12345";
		var allocations = [{
			ID: "234710237512",
			TaskGroup: "core-15515",
			ClientStatus: "complete"
		},{
			ID: "12312361163",
			TaskGroup: "core-17614",
			ClientStatus: "running"
		},{
			ID: "76343762266",
			TaskGroup: "core-26434",
			ClientStatus: "complete"
		},{
			ID: "8425245674",
			TaskGroup: "core-12345",
			ClientStatus: "running"
		},];
		var result = core.findAliveCoreAllocation(allocations, id);
		assert.equal(result.ID, "8425245674");
	});
});


describe("#handleAllocation()", function () {
	it("should return null if no alive allocation", function () {
		var id = "12345";

		var result = core.handleAllocation(null, id, function () {

		});
		assert.equal(result, null);
	});
	it("should return connection info if there's an allocation", function (done) {
		var id = "12345";

		var allocation1 = { 
			ID: '96e2c9e8-863d-940a-79ed-b7160eba1eb5',
			TaskGroup: 'core-610',
			ClientStatus: 'running',
			TaskStates: { 'core-master': { State: 'running', Events: [Object] } },
		}

		var result = core.handleAllocation(allocation1, id, function (taskName) {
			assert.equal(taskName, 'core-master');
			done();
		});
		assert.equal(result.connectionId, id);
		assert.notEqual(result.url, undefined);
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

describe("#checkUniqueRequest()", function () {
	it("should invoke the function if there's not a duplicate request", function (done) {
		var id = "1234";
		var requests1 = [
			{Key: "4242"},
			{Key: "3561"},
			{Key: "6442"},
			{Key: "6480"}
		];
		var requests2 = [
			{Key: "4242"},
			{Key: "3561"},
			{Key: "1234"},
			{Key: "6480"}
		];
		//a little sketchy
		var result = core.checkUniqueRequest(id, requests2, function () {
			assert.fail("", "", "should not have been called");
		});
		core.checkUniqueRequest(id, requests1, function () {
			done();
		});

		assert.equal(result, undefined);
	});
});

describe("#checkHasResources()", function () {
	it("should invoke the first function if FailedTGAllocs is null", function (done) {
		var results = {
			FailedTGAllocs: null
		};
		core.checkHasResources(results, function () {
			done();
		}, function () {
			assert.fail(null, null, "The first function should've been called");
		});
	});
	it("should invoke the second function if FailedTGAllocs exists", function (done) {
		var results = {
			FailedTGAllocs: {}
		};
		core.checkHasResources(results, function () {
			assert.fail(null, null, "The second function should've been called");
		}, function () {
			done();
		});
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
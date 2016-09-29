var mocha = require('mocha');
var assert = require('assert');
var core = require('../app/core.js');
var nomader = require('nomad-helper');

describe("#expect()", function () {
	it("should return an object with a send function to invoke", function () {
		var expecting = core.expect(3, function(){});
		assert(typeof expecting.send === "function", "send is a function. Found " + (typeof expecting.send))
	});
	it("should invoke the callback after the send function is called 3 times and return a job", function (done){
		var key1 = "manticore/1234567890abcdef";
		var key2 = "manticore/abc";
		var key3 = "manticore/123";
		var value = {
			Value: {}
		};
		value.Value = JSON.stringify(value.Value);

		var expecting = core.expect(3, function (job) {
			var groups = job.getJob().Job.TaskGroups;
			assert(groups.length === 3, "There are 3 group tasks. Found " + groups.length);
			done();
		});
		expecting.send(key1, value);
		expecting.send(key2, value);
		expecting.send(key3, value);
	});
});

describe("#findPairs()", function () {
	it("should return an empty array if no pairs are found", function () {
		var cores = [{
			Address: "127.0.0.1",
			Tags: ["userId", "44300", "userToHmi1", "hmiToCore1", "userToCore1"]
		}];
		var hmis = [{
			Address: "127.0.0.1",
			Port: "8687",
			Tags: ["userId2"]
		}];
		var pairs = core.findPairs(cores, hmis);
		assert(pairs.length === 0, "There are no pairs. Found " + pairs.length);
	});

	it("should return 2 pairs that are found", function () {
		var cores = [{
			Address: "127.0.0.1",
			Port: "1211",
			Tags: ["userId1", "44300", "userToHmi1", "hmiToCore1", "userToCore1"]
		},
		{
			Address: "127.0.0.2",
			Port: "1212",
			Tags: ["userId3", "12345", "userToHmi2", "hmiToCore2", "userToCore2"]
		},
		{
			Address: "127.0.0.3",
			Port: "1213",
			Tags: ["userId2", "25252", "userToHmi3", "hmiToCore3", "userToCore3"]
		}];
		var hmis = [{
			Address: "127.0.0.4",
			Port: "8687",
			Tags: ["userId1"]
		},
		{
			Address: "127.0.0.5",
			Port: "1234",
			Tags: ["userId2"]
		},
		{
			Address: "127.0.0.6",
			Port: "2345",
			Tags: ["userId4"]
		}];
		var pairs = core.findPairs(cores, hmis);
		assert(pairs.length === 2, "There are 2 pairs. Found " + pairs.length);
		assert(pairs[0].user === "userId1");
		assert(pairs[0].tcpAddressInternal === "127.0.0.1:44300");
		assert(pairs[0].hmiAddressInternal === "127.0.0.1:1211");
		assert(pairs[0].userAddressInternal === "127.0.0.4:8687");
		assert(pairs[0].userAddressExternal === "userToHmi1");
		assert(pairs[0].hmiAddressExternal === "hmiToCore1");
		assert(pairs[0].tcpAddressExternal === "userToCore1");

		assert(pairs[1].user === "userId2");
		assert(pairs[1].tcpAddressInternal === "127.0.0.3:25252");
		assert(pairs[1].hmiAddressInternal === "127.0.0.3:1213");
		assert(pairs[1].userAddressInternal === "127.0.0.5:1234");
		assert(pairs[1].userAddressExternal === "userToHmi3");
		assert(pairs[1].hmiAddressExternal === "hmiToCore3");
		assert(pairs[1].tcpAddressExternal === "userToCore3");
	});

	it("should invoke callback for every HMI not paired with core", function (done) {
		var cores = [{
			Address: "127.0.0.1",
			Port: "1211",
			Tags: ["userId1", "44300", "userToHmi1", "hmiToCore1", "userToCore1"]
		},
		{
			Address: "127.0.0.2",
			Port: "1212",
			Tags: ["userId3", "12345", "userToHmi2", "hmiToCore2", "userToCore2"]
		},
		{
			Address: "127.0.0.3",
			Port: "1213",
			Tags: ["userId2", "25252", "userToHmi3", "hmiToCore3", "userToCore3"]
		}];
		var hmis = [{
			Address: "127.0.0.4",
			Port: "8687",
			Tags: ["userId1"]
		},
		{
			Address: "127.0.0.5",
			Port: "1234",
			Tags: ["userId2"]
		},
		{
			Address: "127.0.0.6",
			Port: "2345",
			Tags: ["userId4"]
		}];
		var pairs = core.findPairs(cores, hmis, function (userId) {
			assert(userId === "userId4", "userId4 has no core pair. Found " + userId);
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
		var testData = [{
			LockIndex: 0,
			Key: 'manticore/1234567890abcdef',
			Flags: 0,
			Value: '{"url":"http://127.0.0.1:3000/v1/address","branch":{"hmi":"master","core":"master"},"hmiName":"ford","userToHmiPrefix":"fr0231rj23t","hmiToCorePrefix":"t20tg84j3t","userToCorePrefix":"5410"}'
		},
		{
			LockIndex: 0,
			Key: 'manticore/1234567890abcdef',
			Flags: 0,
			Value: '{"url":"http://127.0.0.1:3000/v1/address","branch":{"hmi":"master","core":"master"},"hmiName":"ford","userToHmiPrefix":"g345yg36","hmiToCorePrefix":"2juh542q5jui6","userToCorePrefix":"9372"}'
		}];
		var addresses = core.getAddressesFromUserRequests(testData);
		assert(addresses.length === 6, "there are 6 addresses. found " + addresses.length);
		assert(addresses[0] === "fr0231rj23t");
		assert(addresses[1] === "t20tg84j3t");
		assert(addresses[2] === "5410");
		assert(addresses[3] === "g345yg36");
		assert(addresses[4] === "2juh542q5jui6");
		assert(addresses[5] === "9372");
	});
});

describe("#generateNginxFile()", function () {
	it("should retrieve all address prefixes from all keys in manticore", function () {
		var testData = {
			pairs: [{
				user: "3456789yduc2nj3f",
				userAddressInternal: "127.0.0.1:4000",
				hmiAddressInternal: "127.0.0.1:5000",
				tcpAddressInternal: "127.0.0.1:6000",
				userAddressExternal: "15uyh6176",
				hmiAddressExternal: "a4a4y43yq53",
				tcpAddressExternal: "2742"
			}]
		};
		var nginxFile = core.generateNginxFile(testData);
		//there should be 4 server blocks. check for server_name as a string
		var matches = nginxFile.match(/server_name/g);
		assert(matches.length === 4, "there are 4 server blocks. found " + matches.length);
	});

});

describe("#addHmisToJob()", function () {
	it("should create an hmi job based on the core job", function () {
		var job = nomader.createJob("hmi");
		var cores = [{
			Address: "127.0.0.1",
			Port: "1211",
			Tags: ["userId1", "44300", "userToHmi1", "hmiToCore1", "userToCore1"]
		},
		{
			Address: "127.0.0.2",
			Port: "1212",
			Tags: ["userId3", "12345", "userToHmi2", "hmiToCore2", "userToCore2"]
		}];
		core.addHmisToJob(job, cores);
		//check env and tag for each hmi task
		var env1 = job.findTask("hmi-userId1", "hmi-master").Env.HMI_WEBSOCKET_ADDR;
		var env2 = job.findTask("hmi-userId3", "hmi-master").Env.HMI_WEBSOCKET_ADDR;
		var tag1 = job.findTask("hmi-userId1", "hmi-master").Services[0].Tags[0];
		var tag2 = job.findTask("hmi-userId3", "hmi-master").Services[0].Tags[0];
		assert(env1 === "hmiToCore1." + process.env.DOMAIN_NAME + ":3000");
		assert(env2 === "hmiToCore2." + process.env.DOMAIN_NAME + ":3000");
		assert(tag1 === cores[0].Tags[0]);
		assert(tag2 === cores[1].Tags[0]);
	});

});
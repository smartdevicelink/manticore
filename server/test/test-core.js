var mocha = require('mocha');
var assert = require('assert');
var core = require('../app/core.js');

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
		assert(pairs[0].hmiAddressInternal === "127.0.0.4:8687");
		assert(pairs[0].userAddressInternal === "127.0.0.1:1211");
		assert(pairs[0].userAddressExternal === "userToHmi1");
		assert(pairs[0].hmiAddressExternal === "hmiToCore1");
		assert(pairs[0].tcpAddressExternal === "userToCore1");

		assert(pairs[1].user === "userId2");
		assert(pairs[1].tcpAddressInternal === "127.0.0.3:25252");
		assert(pairs[1].hmiAddressInternal === "127.0.0.5:1234");
		assert(pairs[1].userAddressInternal === "127.0.0.3:1213");
		assert(pairs[1].userAddressExternal === "userToHmi3");
		assert(pairs[1].hmiAddressExternal === "hmiToCore3");
		assert(pairs[1].tcpAddressExternal === "userToCore3");
	});
});
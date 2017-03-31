var mocha = require('mocha');
var assert = require('assert');
var core = require('./core.js');

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
		assert.strictEqual(result, null);
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
		assert.strictEqual(result, null);
	});

	it("should return a match if an ID matches", function () {
		var id = "12345";
		var allocations = [{
			ID: "234710237512",
			TaskGroup: "core-group-15515",
			ClientStatus: "complete"
		},{
			ID: "12312361163",
			TaskGroup: "core-group-17614",
			ClientStatus: "running"
		},{
			ID: "76343762266",
			TaskGroup: "core-group-26434",
			ClientStatus: "complete"
		},{
			ID: "8425245674",
			TaskGroup: "core-group-12345",
			ClientStatus: "running"
		},];
		var result = core.findAliveCoreAllocation(allocations, id);
		assert.strictEqual(result.ID, "8425245674");
	});
});

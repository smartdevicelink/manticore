var mocha = require('mocha');
var assert = require('assert');
var AwsHandler = require('../AwsHandler.js')();

//sample data
var expectedListeners0;
var actualListeners0;
var expectedListeners1;
var actualListeners1;
var expectedListeners2;
var actualListeners2;
var expectedListeners3;
var actualListeners3;

beforeEach(function() {
// reset the data, as it will change between tests
	expectedListeners0 = [];
	actualListeners0 = [];
	expectedListeners1 = [{
		Protocol: "SSL",
		LoadBalancerPort: 444,
	}];
	actualListeners1 = [{
		Protocol: "HTTPS",
		LoadBalancerPort: 443,
	}];
	expectedListeners2 = [{
		Protocol: "SSL",
		LoadBalancerPort: 444,
	},
	{
		Protocol: "HTTPS",
		LoadBalancerPort: 443,
	}];
	actualListeners2 = [{
		Protocol: "HTTPS",
		LoadBalancerPort: 443,
	},
	{
		Protocol: "SSL",
		LoadBalancerPort: 444,
	}];
	expectedListeners3 = [{
		Protocol: "HTTPS",
		LoadBalancerPort: 443,
	}];
	actualListeners3 = [{
		Protocol: "SSL",
		LoadBalancerPort: 443,
	}];
});

describe("#calculateListenerChanges()", function () {
	it("should return no changes (no listeners)", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners0, actualListeners0);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 0);

	});
	it("should return no changes (with listeners)", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners2, actualListeners2);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 0);
	});
	it("should propose adding listeners (2 from 0 listeners)", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners2, actualListeners0);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].LoadBalancerPort, 443);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].Protocol, "HTTPS");
		assert.strictEqual(listenerChanges.toBeAddedListeners[1].LoadBalancerPort, 444);
		assert.strictEqual(listenerChanges.toBeAddedListeners[1].Protocol, "SSL");
	});
	it("should propose adding listeners (2 from 1 listener)", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners2, actualListeners1);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].LoadBalancerPort, 444);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].Protocol, "SSL");
	});
	it("should propose removing listeners (0 from 2 listeners)", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners0, actualListeners2);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeDeletedListeners[0], 443);
		assert.strictEqual(listenerChanges.toBeDeletedListeners[1], 444);
	});
	it("should propose removing listeners (1 from 2 listener)", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners1, actualListeners2);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeDeletedListeners[0], 443);
	});
	it("should add and remove a listener with a port that should stay but has outdated information", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners3, actualListeners3);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 1);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 1);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].LoadBalancerPort, 443);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].Protocol, "HTTPS");
		assert.strictEqual(listenerChanges.toBeDeletedListeners[0], 443);
	});
});

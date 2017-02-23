var mocha = require('mocha');
var assert = require('assert');
var AwsHandler = require('../AwsHandler.js')();

//sample data
var expectedListeners0 = [];
var actualListeners0 = [];

var expectedListeners1 = [{
	Protocol: "SSL",
	LoadBalancerPort: 444,
}];
var actualListeners1 = [{
	Protocol: "HTTPS",
	LoadBalancerPort: 443,
}];

var expectedListeners2 = [{
	Protocol: "SSL",
	LoadBalancerPort: 444,
},
{
	Protocol: "HTTPS",
	LoadBalancerPort: 443,
}];
var actualListeners2 = [{
	Protocol: "HTTPS",
	LoadBalancerPort: 443,
},
{
	Protocol: "SSL",
	LoadBalancerPort: 444,
}];

describe("#calculateListenerChanges()", function () {
	it("should return no changes", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners0, actualListeners0);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 0);
		listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners2, actualListeners2);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners.length, 0);
	});
	it("should propose adding listeners", function () {
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners2, actualListeners0);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].LoadBalancerPort, 443);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].Protocol, "HTTPS");
		assert.strictEqual(listenerChanges.toBeAddedListeners[1].LoadBalancerPort, 444);
		assert.strictEqual(listenerChanges.toBeAddedListeners[1].Protocol, "SSL");

		listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners2, actualListeners1);
		assert.strictEqual(listenerChanges.toBeDeletedListeners.length, 0);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].LoadBalancerPort, 444);
		assert.strictEqual(listenerChanges.toBeAddedListeners[0].Protocol, "SSL");
	});
});

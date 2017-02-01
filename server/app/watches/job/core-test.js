var mocha = require('mocha');
var assert = require('assert');
var core = require('./core.js');

describe("#checkHasResources()", function () {
	it("should return true if the FailedTGAllocs parameter is null", function () {
		var obj1 = {
			FailedTGAllocs: "something"
		}
		var obj2 = {
			FailedTGAllocs: null
		};

		var result1 = core.checkHasResources(obj1);
		var result2 = core.checkHasResources(obj2);
		assert.strictEqual(result1, false);
		assert.strictEqual(result2, true);
	});
});

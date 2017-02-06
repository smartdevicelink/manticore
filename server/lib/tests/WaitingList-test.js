var mocha = require('mocha');
var assert = require('assert');
var WaitingList = require('../WaitingList.js');

describe("#getQueuePositions()", function () {
	it("should return the correct positions of each unclaimed user in the queue", function () {
		var waitingListObj = {
			"53": {
				claimed: true,
				queue: 1
			},
			"32": {
				claimed: false,
				queue: 5
			},
			"24": {
				claimed: true,
				queue: 4
			},
			"85": {
				claimed: true,
				queue: 2
			},
			"33": {
				claimed: false,
				queue: 8
			},
			"15": {
				claimed: false,
				queue: 9
			}
		}
		var waitingListValue = {
			Value: JSON.stringify(waitingListObj)
		};
		var waitingListPositions = WaitingList(waitingListValue).getQueuePositions();
		assert.strictEqual(waitingListPositions["32"], 0);
		assert.strictEqual(waitingListPositions["33"], 1);
		assert.strictEqual(waitingListPositions["15"], 2);
	});
});

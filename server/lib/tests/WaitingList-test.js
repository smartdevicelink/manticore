var mocha = require('mocha');
var assert = require('assert');
var WaitingList = require('../WaitingList.js');

var waitingListObj = {
	"53": {
		state: "claimed",
		queue: 1
	},
	"32": {
		state: "waiting",
		queue: 5
	},
	"24": {
		state: "pending",
		queue: 4
	},
	"85": {
		state: "claimed",
		queue: 2
	},
	"33": {
		state: "waiting",
		queue: 8
	},
	"15": {
		state: "waiting",
		queue: 9
	}
}


describe("#nextInQueue()", function () {
	it("should return the ID with the lowest queue number that isn't pending or claimed", function () {
		var waitingListValue = {
			Value: JSON.stringify(waitingListObj)
		};
		var nextID = WaitingList(waitingListValue).nextInQueue();
		assert.strictEqual(nextID, "32");
	});
});


describe("#getQueuePositions()", function () {
	it("should return the correct positions of each unclaimed user in the queue", function () {
		var waitingListValue = {
			Value: JSON.stringify(waitingListObj)
		};
		var waitingListPositions = WaitingList(waitingListValue).getQueuePositions();
		assert.strictEqual(waitingListPositions["32"], 0);
		assert.strictEqual(waitingListPositions["33"], 1);
		assert.strictEqual(waitingListPositions["15"], 2);
	});
});

describe("#update()", function () {
	it("should add new users from requestKeys to waiting list, and inform those not in requestKeys", function () {
		var waitingListValue = {
			Value: JSON.stringify(waitingListObj)
		};
		var waitingList = WaitingList(waitingListValue);
		var lostKeys = [];
		waitingList.update(["53", "32", "24", "15", "77", "90"], function (lostKey) {
			lostKeys.push(lostKey);
		});
		assert.strictEqual(lostKeys[0], "33");
		assert.strictEqual(lostKeys[1], "85");

		assert.strictEqual(waitingList.waiting["53"].queue, 1);
		assert.strictEqual(waitingList.waiting["32"].queue, 5);
		assert.strictEqual(waitingList.waiting["24"].queue, 4);
		assert.strictEqual(waitingList.waiting["15"].queue, 9);
		assert.strictEqual(waitingList.waiting["77"].queue, 10);
		assert.strictEqual(waitingList.waiting["77"].state, "waiting");
		assert.strictEqual(waitingList.waiting["90"].queue, 11);
		assert.strictEqual(waitingList.waiting["90"].state, "waiting");
	});
});
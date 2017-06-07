module.exports = function (waitingObj) {
    return new WaitingList(waitingObj);
}

/**
* Stores information about the state of all users in the waiting list
* @constructor
* @param {object} waitingObj - An object retrieved from Consul's KV store 
* @param {string} waitingObj.Value - Stringified JSON of all user information in the waiting list
*/
function WaitingList (waitingObj) {
	this.waiting = {};
	if (waitingObj) {
		this.waiting = JSON.parse(waitingObj.Value);
	}
}

/**
* Converts users' waiting list information back into a string for Consul's KV store
* @param {string} waitingObj.Value - Stringified JSON of all user information in the waiting list
* @returns {string} - Stringified JSON
*/
WaitingList.prototype.get = function () {
	return JSON.stringify(this.waiting);
}

/**
* Sets a particular user's state to claimed which states that they can use a core/hmi
* @param {string} key - The ID of the user
*/
WaitingList.prototype.setClaimed = function (key) {
	this.waiting[key].state = "claimed";
}

/**
* Sets a particular user's state to waiting
* @param {string} key - The ID of the user
*/
WaitingList.prototype.setWaiting = function (key) {
	this.waiting[key].state = "waiting";
}

/**
* Sets a particular user's state to pending which means the allocation is trying to run
* @param {string} key - The ID of the user
*/
WaitingList.prototype.setPending = function (key) {
	this.waiting[key].state = "pending";
}

/**
* Figures out if there are any users whose ID indicates that they are waiting for the 
* status of a job submission
* @returns {string} - A user ID whose state is "pending"
*/
WaitingList.prototype.checkPending = function () {
	for (var key in this.waiting) {
		if (this.waiting[key].state === "pending") {
			return key;
		}
	}
	return null;
}

/**
* Searches the waiting list for the user ID with the lowest waiting property (front of waiting list)
* @returns {string} - ID of the user
*/
WaitingList.prototype.nextInQueue = function () {
	//return the key that is the next in the queue that hasn't claimed a core
	//if returned null, there were no more in the waiting list
	var lowestIndex = Infinity;
	var lowestKey = null;
	for (var key in this.waiting) {
		var value = this.waiting[key].queue;
		var state = this.waiting[key].state;
		if (state === "waiting" && value < lowestIndex) {
			lowestIndex = value;
			lowestKey = key;
		}
	}
	return lowestKey;
}

/**
* Uses requestKeys to determine what the current state of the waiting list should be
* @param {array} requestKeys - An array of all the keys in the KV store for the request list
* @param {WaitingList~updateCallback} callback - callback
*/
WaitingList.prototype.update = function (requestKeys, callback) {
	//get the highest queue number in the waiting list
	var highestIndex = 0;
	for (var key in this.waiting) {
		var index = this.waiting[key].queue;
		if (index > highestIndex) {
			highestIndex = index;
		} 
	}
	//any keys that are in requestKeys that aren't in the waiting list 
	//should be added to the waiting list
	for (let i = 0; i < requestKeys.length; i++) {
		if (!this.waiting[requestKeys[i]]) {
			this.waiting[requestKeys[i]] = {
				queue: highestIndex + 1, //end of the queue
				state: "waiting"
			}
			highestIndex++;
		}
	}
	//now check if each element in the waiting list exists in the requests
	//if it doesn't, remove it
	for (var key in this.waiting) {
		if (requestKeys.indexOf(key) === -1) {//not found. inform the caller for additional action
			callback(key);
		}
	}
}
/**
 * Callback object for WaitingList.updateCallback
 * @callback WaitingList~updateCallback
 * @param {string} key - A user ID that shouldn't exist in the waiting list anymore
 */


/**
* Removes a user ID from the waiting list
* @param {string} key - A user ID 
*/
WaitingList.prototype.remove = function (key) {
	delete this.waiting[key];
}

/**
* Calculates for each user how many people are in front of them in the queue
* Warning: this is an O(n^2) operation, where n is the number of people in the waiting list
* @returns {object} - An object which maps user IDs to the number of people in front of them as KV pairs
*/
WaitingList.prototype.getQueuePositions = function () {
	//calculate the position each user is in the waiting list that hasn't claimed a core/hmi
	var results = {};

	for (var key in this.waiting) {
		var user = this.waiting[key];
		if (user.state === "waiting") {
			var queueNumber = user.queue;
			//find how many users are before this user
			//a user is in front of another if their queue number is lower and claimed is false
			var waitingCount = 0;
			for (var target in this.waiting) {
				if (this.waiting[target].state === "waiting" && this.waiting[target].queue < queueNumber) {
					waitingCount++;
				}
			}
			//associate the user with their place in line (0 is front of the queue)
			results[key] = waitingCount; 
		}

	}

	return results;
}
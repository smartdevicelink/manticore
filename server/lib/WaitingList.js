module.exports = function (waitingObj) {
    return new WaitingList(waitingObj);
}

//converts the stringified input into JSON
function WaitingList (waitingObj) {
	this.waiting = {};
	if (waitingObj) {
		this.waiting = JSON.parse(waitingObj.Value);
	}
}

WaitingList.prototype.get = function () {
	return JSON.stringify(this.waiting);
}

WaitingList.prototype.setClaimed = function (key, value) {
	this.waiting[key].claimed = value;
}

WaitingList.prototype.nextInQueue = function () {
	//return the key that is the next in the queue that hasn't claimed a core
	//if returned null, there were no more in the waiting list
	var lowestIndex = Infinity;
	var lowestKey = null;
	for (var key in this.waiting) {
		var value = this.waiting[key].queue;
		var claimed = this.waiting[key].claimed;
		if (claimed === false && value < lowestIndex) {
			lowestIndex = value;
			lowestKey = key;
		}
	}
	return lowestKey;
}

WaitingList.prototype.update = function (requestKeys) {
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
				claimed: false
			}
			highestIndex++;
		}
	}
	//now check if each element in the waiting list exists in the requests
	//if it doesn't, remove it
	for (var key in this.waiting) {
		if (requestKeys.indexOf(key) === -1) {//not found. remove from waiting list
			delete this.waiting[key];
		}
	}
}

WaitingList.prototype.filterRequests = function (requestKV) {
	var filteredKV = {};
	for (var key in requestKV) {
		if (this.waiting[key] && this.waiting[key].claimed) {
			//this request key is part of the waiting list and is claimed
			filteredKV[key] = requestKV[key];
		}
	}
	return filteredKV;
}

//warning: this is an O(n^2) operation, where n is the number of people in the waiting list
WaitingList.prototype.getQueuePositions = function () {
	//calculate the position each user is in the waiting list that hasn't claimed a core/hmi
	var results = {};

	for (var key in this.waiting) {
		var user = this.waiting[key];
		if (!user.claimed) {
			var queueNumber = user.queue;
			//find how many users are before this user
			//a user is in front of another if their queue number is lower and claimed is false
			var waitingCount = 0;
			for (var target in this.waiting) {
				if (!this.waiting[target].claimed && this.waiting[target].queue < queueNumber) {
					waitingCount++;
				}
			}
			//associate the user with their place in line (0 is front of the queue)
			results[key] = waitingCount; 
		}

	}

	return results;
}
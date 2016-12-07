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

WaitingList.prototype.nextInQueue = function (pass, fail) {
	//return the key that is the next in the queue that hasn't claimed a core
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
	if (lowestKey) {
		pass(lowestKey);
	}
	else {
		fail();
	}
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
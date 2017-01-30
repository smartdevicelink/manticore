module.exports = {
	findAliveCoreAllocation: function (allocations, targetID) {
		for (let i = 0; i < allocations.length; i++) {
			//remove "core-" from taskgroup name to get just the ID
			var testID = allocations[i].TaskGroup.split("core-")[1];
			//allow targetID to be a string or a number
			if (testID == targetID) {
				//only return the alloc ID if the ClientStatus is set to "running"
				//try accepting it if the status is also "pending"
				if (allocations[i].ClientStatus === "running" || 
					allocations[i].ClientStatus === "pending" ) {
					return allocations[i];
				}
			}
		}
		return null; //return null if nothing matches
	}
}
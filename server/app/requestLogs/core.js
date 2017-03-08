/** @module app/requestLogs/core */

module.exports = {
	/**
	* Finds an allocation for a specific user for sdl_core
	* @param {array} allocations - An array of allocation objects from Nomad
	* @param {string} targetID - The user ID
	* @returns {object} - A found allocation object. May be null.
	*/
	findAliveCoreAllocation: function (allocations, targetID) {
		for (let i = 0; i < allocations.length; i++) {
			//remove "core-group-" from taskgroup name to get just the ID
			var testID = allocations[i].TaskGroup.split("core-group-")[1];
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
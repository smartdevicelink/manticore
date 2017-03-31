var core = require('./core.js');
/** @module app/requestLogs/shell */

module.exports = {	
	/**
	* Checks Consul if there is an allocation for sdl_core intended for this user
	* @param {Context} context - Context instance
	* @param {string} id - ID of the user
	* @param {checkValidAllocationCallback} callback - callback
	*/
	checkValidAllocation: function (context, id, callback) {
		//make sure there is an allocation for core intended for this user before starting up a connection
		context.nomader.getAllocations(strings.coreHmiJobPrefix + id, context.nomadAddress, function (res) {
			callback(core.findAliveCoreAllocation(res.allocations, id, context.strings));
		});
	},
	/**
	* Callback object for checkValidAllocation
	* @callback checkValidAllocationCallback
	* @param {object} - An allocation object for sdl_core. May be null
	*/

	/**
	* Finds the HTTP address of the allocated sdl_core running on a machine
	* @param {Context} context - Context instance
	* @param {object} store - Information required to search for this HTTP address
	* @param {object} store.allocation - An allocation object of sdl_core
	* @param {string} store.taskName - The name of the task for the allocation
	* @param {getAgentLogAddressCallback} callback - callback
	*/	
	getAgentLogAddress: function (context, store, callback) {
		var nodeID = store.allocation.NodeID;
		context.nomader.getNodeStatus(nodeID, context.nomadAddress, function (data) {
			callback(data.HTTPAddr);
		});
	}
	/**
	* Callback object for getAgentLogAddress
	* @callback getAgentLogAddressCallback
	* @param {string} - The HTTP address of the running sdl_core
	*/
}

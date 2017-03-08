var core = require('./core.js');

module.exports = {
	checkValidAllocation: function (context, id, callback) {
		//make sure there is an allocation for core intended for this user before starting up a connection
		context.nomader.getAllocations("core-hmi-" + id, context.nomadAddress, function (res) {
			callback(core.findAliveCoreAllocation(res.allocations, id));
		});
	},
	getAgentLogAddress: function (context, store, callback) {
		var nodeID = store.allocation.NodeID;
		context.nomader.getNodeStatus(nodeID, context.nomadAddress, function (data) {
			callback(data.HTTPAddr);
		});
	}
}
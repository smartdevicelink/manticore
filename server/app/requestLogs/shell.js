var core = require('./core.js');

module.exports = {
	checkValidAllocation: function (context, id, callback) {
		//make sure there is an allocation for core intended for this user before starting up a connection
		context.nomader.getAllocations("core", context.nomadAddress, function (res) {
			callback(core.findAliveCoreAllocation(res.allocations, id));
		});
	},
	getAgentLogAddress: function (context, allocation, callback) {
		var nodeID = allocation.NodeID;
		context.nomader.getNodeStatus(nodeID, context.nomadAddress, function (data) {
			return data.HTTPAddr;
		});
	}
}
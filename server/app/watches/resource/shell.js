/** @module app/watches/resource/shell */

module.exports = {
	/**
	* Compiles resource statistics among all client nodes in the cluster
	* @param {Context} context - Context instance
	*/
	getStats: function (context) {
		context.nomader.getNodes(context.nomadAddress, function (data) {
			//console.error(JSON.stringify(data, null, 4));
			//find the resource stats of each client node
			var nodeIDs = [];
			for (let i = 0; i < data.length; i++) {
				nodeIDs.push(data[i].ID);
			}

			var copyLength = nodeIDs.length;
			for (let i = 0; i < nodeIDs.length; i++) {
				context.nomader.getNodeStatus(nodeIDs[i], context.nomadAddress, function (data2) {
					console.error(JSON.stringify(data2, null, 4));
					context.nomader.getResourceUsage(data2.HTTPAddr, function (data3) {
						console.error(JSON.stringify(data3, null, 4));
					});					
				});
			}
		});
	}
}


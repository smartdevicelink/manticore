//entry point to all manticore logic
//also meant to explain at a high level what is going on in each request
var functionite = require('functionite');
//SUBFOLDER MODULES
var requestCoreLogic = require('./requestCore/shell.js');
var requestLogsLogic = require('./requestLogs/shell.js');
var watchesLogic = require('./watches/shell.js');

var context; //context object provided by init()

module.exports = init;

var utility = {
	requestCore: function (body) {
		//check that the user hasn't already tried to request a core
		requestCoreLogic.checkUniqueRequest(body.id, context, function (isUnique, requestsKV) {
			if (isUnique) { //new ID confirmed
				//create a user request object for storing in the KV store
				var requestJSON = context.UserRequest(body);
				//check if haproxy is enabled. if it is, we need to generate external URL prefixes
				//that would be used for HAProxy and store them in the request object
				if (context.isHaProxyEnabled()) { 
					requestCoreLogic.addExternalAddresses(requestJSON, requestsKV);
				}
				//store the request object!
				context.logger.debug("Store request " + requestJSON.id);
				requestCoreLogic.storeRequestInKVStore(requestJSON, context);
			}
			else { //duplicate request
				context.logger.debug("Duplicate request from " + id);
			} 
		});
		//start the websocket server for this id
		context.socketManager.requestConnection(id);
		//return the appropriate address the client should connect to
		var websocketAddress = context.getWsUrl() + "/" + id;
		//use the id for the socket connection
		logger.debug("Connection ID:" + id);
		logger.debug("Connection URL:" + websocketAddress);
		return websocketAddress;
	}, 
	requestLogs: function (userId) {
		//make sure there is an allocation for core intended for this user before starting up a connection
		var allocation;
		var task;
		functionite()
		.pass(requestLogsLogic.getValidAllocation, context, userId)
		.pass(function (validAllocation, callback) {
			if (validAllocation === null) {
				//core isn't available to stream logs
				logger.debug("Core isn't available for streaming for connection ID " + userId);
			}
			else {
				var taskName; //get the task name
				for (var obj in validAllocation.TaskStates) {
					taskName = obj;
					break;
				}
				allocation = validAllocation;
				task = taskName;
				callback();
			}
		}) //get the client agent address using its node ID
		.toss(requestLogsLogic.getAgentLogAddress, context, allocation)
		.pass(function (targetedAddress) {
			logger.debug("Client agent address found:");
			logger.debug(targetedAddress);
			//start streaming logs to the client once they connect using the connection details
			context.nomader.streamLogs(allocation.ID, taskName, "stdout", targetedAddress, function (logData) {
				//this function gets invoked whenever new data arrives from core
				context.socketHandler.send(userId, "logs", logData);
			});							
		})
		.go();
	}
};

function init (contextObj) {
	context = contextObj; //set context
	context.logger.debug("Nomad address: " + context.agentAddress + ":4646");
	//add filler keys so we can detect changes to empty lists in the KV store
	functionite()
	.toss(context.consuler.setKeyValue, context.keys.fillers.request, "Keep me here please!")
	.toss(context.consuler.setKeyValue, context.keys.fillers.waiting, "Keep me here please!")
	.toss(context.consuler.setKeyValue, context.keys.haproxy.mainPort, process.env.HAPROXY_HTTP_LISTEN)
	.toss(context.consuler.setKeyValue, context.keys.haproxy.domainName, process.env.DOMAIN_NAME)
	.toss(function () {
		//set up watches once. listen forever for changes in consul's services
		watchesLogic.startKvWatch(context);
		watchesLogic.startServiceWatch(context);
	}).go();
	return utility; //return utility object
}
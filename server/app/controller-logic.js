//entry point to all manticore logic
//also meant to explain at a high level what is going on in each request
var functionite = require('functionite');
//SUBFOLDER MODULES
var requestCoreLogic = require('./requestCore/shell.js');
var requestLogsLogic = require('./requestLogs/shell.js');
var watchesLogic = require('./watches/shell.js');

var context; //context object provided by init()

module.exports = init;

/** @module app/controller-logic */

var utility = {
	/**
	* Requests an instance of sdl_core and HMI to be ran
	* @function requestCore
	* @param {object} body - The body of the user request
	* @returns {string} - The address of Manticore for the user to connect to via websockets
	*/
	requestCore: function (body) {
		//check that the user hasn't already tried to request a core
		requestCoreLogic.checkUniqueRequest(body.id, context, function (isUnique, requestsKV) {
			if (isUnique) { //new ID confirmed
				//create a user request object for storing in the KV store
				var requestJSON = context.UserRequest(body);
				//check if haproxy is enabled. if it is, we need to generate external URL prefixes
				//that would be used for HAProxy and store them in the request object
				if (context.config.haproxy) { 
					requestCoreLogic.addExternalAddresses(context, requestJSON, requestsKV);
				}
				//store the request object!
				context.logger.debug("Store request " + body.id);
				requestCoreLogic.storeRequestInKVStore(requestJSON, context);
			}
			else { //duplicate request
				context.logger.debug("Duplicate request from " + body.id);
			} 
		});
		//start the websocket server for this id
		context.socketHandler.requestConnection(body.id);
		//return the appropriate address the client should connect to
		var websocketAddress = context.getWsUrl() + "/" + body.id;
		//use the id for the socket connection
		context.logger.debug("Connection ID:" + body.id);
		context.logger.debug("Connection URL:" + websocketAddress);
		return websocketAddress;
	}, 
	/**
	* Requests sdl_core logs to be streamed from Nomad to Manticore to the user
	* @function requestLogs
	* @param {string} userId - The user's ID
	*/
	requestLogs: function (userId) {
		//make sure there is an allocation for core intended for this user before starting up a connection
		var store = { //reference of object which holds information that functionite could use
			allocation: null,
			taskName: null
		};
		functionite()
		.pass(requestLogsLogic.checkValidAllocation, context, userId)
		.pass(function (validAllocation, callback) {
			if (validAllocation === null) {
				//core isn't available to stream logs
				context.logger.debug("Core isn't available for streaming for connection ID " + userId);
			}
			else {
				var taskName; //get the task name
				for (var key in validAllocation.TaskStates) {
					taskName = key;
					break;
				}
				store.allocation = validAllocation;
				store.taskName = taskName;
				callback();
			}
		}) //get the client agent address using its node ID
		//pass the store object as it will hold a reference to the allocation when it is created later
		.toss(requestLogsLogic.getAgentLogAddress, context, store)
		.pass(function (targetedAddress) {
			context.logger.debug("Client agent address found:");
			context.logger.debug(targetedAddress);
			context.logger.debug("Task name: " + store.taskName);
			//start streaming logs to the client once they connect using the connection details
			context.nomader.streamLogs(store.allocation.ID, store.taskName, "stdout", targetedAddress, function (logData) {
				//this function gets invoked whenever new data arrives from core
				context.socketHandler.send(userId, "logs", logData);
			});							
		})
		.go();
	},
	/**
	* Requests sdl_core and HMI to be stopped
	* @function deleteCore
	* @param {string} userId - The user's ID
	*/
	deleteCore: function (userId) {
		//remove the request id of the same id from the KV store
		context.consuler.delKey(context.keys.data.request + "/" + userId, function () {
			//that's literally it.
		});
	}
};


/**
* Sets up watches to the KV store and to Consul's service changes
* @param {Context} contextObj - Instantiated Context object
* @returns {object} - A utility object defined in this module
*/
function init (contextObj) {
	context = contextObj; //set context
	context.logger.debug("Nomad address: " + context.agentAddress + ":4646");
	//add filler keys so we can detect changes to empty lists in the KV store
	var httpListen;
	var domainName;
	if (context.config.haproxy) {
		httpListen = context.config.haproxy.httpListen;
		domainName = context.config.haproxy.domainName;
	}
	functionite()
	.toss(context.consuler.setKeyValue, context.keys.fillers.request, "Keep me here please!")
	.toss(context.consuler.setKeyValue, context.keys.fillers.waiting, "Keep me here please!")
	.toss(context.consuler.setKeyValue, context.keys.fillers.allocation, "Keep me here please!")
	.toss(context.consuler.setKeyValue, context.keys.haproxy.mainPort, httpListen)
	.toss(context.consuler.setKeyValue, context.keys.haproxy.domainName, domainName)
	.toss(function () {
		//set up watches once. listen forever for changes in consul's services
		watchesLogic.startKvWatch(context);
		watchesLogic.startServiceWatch(context);
	}).go();
	return utility; //return utility object
}
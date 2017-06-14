//entry point to all manticore logic
//also meant to explain at a high level what is going on in each request
var functionite = require('functionite');
//SUBFOLDER MODULES
var requestCoreLogic = require('./requestCore/shell.js');
var requestLogsLogic = require('./requestLogs/shell.js');
var watchesLogic = require('./watches/shell.js');

var context; //context object provided by init()

module.exports = init;

//keeps track of users who requested an instance but are not in the KV store yet.
var requestingUsers = {};
/** @module app/controller-logic */

var utility = {
	/**
	* Requests an instance of sdl_core and HMI to be ran
	* @function requestCore
	* @param {object} body - The body of the user request
	*/
	requestCore: function (body) {
		//check that the user hasn't already tried to request a core
		requestCoreLogic.checkUniqueRequest(body.id, context, function (isUnique, requestsKV) {
			if (isUnique && !requestingUsers.id) { //new ID confirmed
				requestingUsers.id = true;
				var watch = context.nomader.watchAllocations(context.strings.coreHmiJobPrefix + body.id, context.nomadAddress, 5, function (allocations) {
					//make sure both allocations for core and hmi tasks are complete
					var completed = true;
					if (allocations[0] && allocations[0].ClientStatus !== "complete") {
						completed = false;
					} 
					if (allocations[1] && allocations[1].ClientStatus !== "complete") {
						completed = false;
					} 
					if (completed) {
						//core and hmi tasks dont exist for this user or are dead.
						watch.end();
						//create a user request object for storing in the KV store
						var requestJSON = context.UserRequest(body);
						//store the date when this object is made
						requestJSON.startTime = new Date();
						//check if haproxy is enabled. if it is, we need to generate external URL prefixes
						//that would be used for HAProxy and store them in the request object
						if (context.config.haproxy) { 
							requestCoreLogic.addExternalAddresses(context, requestJSON, requestsKV);
						}
						//store the request object!

						context.logger.debug("Store request " + body.id);
						requestCoreLogic.storeRequestInKVStore(requestJSON, context, function () {
							requestingUsers.id = false; //user made it to the KV store. set key for id to false
						});
					}
				});
			}
			else { //duplicate request, or key already in KV store
				context.logger.debug("Duplicate request from " + body.id);
			} 
		});

		//start the websocket server for this id and get the random string generated for this id
		context.socketHandler.requestConnection(body.id);
		var suffixString = context.socketHandler.getConnectionString(body.id);
		//return the appropriate address the client should connect to
		var websocketAddress = context.getWsUrl() + "/" + suffixString;
		//use the id for the socket connection
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
				//we know what the task name must be solely based on the id of the user!
				taskName = context.strings.coreTaskPrefix + userId;
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
		watchesLogic.removeUser(context, userId);
		//that's literally it.
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
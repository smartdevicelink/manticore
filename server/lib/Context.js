//an object that manages and contains global information necessary across all modules
//the modules come from the /lib folder are put here
var SocketHandler = require('./SocketHandler.js');

module.exports = Context;

/**
* Manages and contains global information necessary across all modules
* @constructor
* @param {object} app - An express instance
* @param {object} socketio - A socket.io instance attached to an http server
* @param {winston.Logger} logger - A logging instance 
* @param {string} address - The address of the machine that this web app is running in
*/
function Context (app, socketio, logger, config) {
	this.app = app; //express app
	this.socketHandler = new SocketHandler(socketio); //socket manager module
	this.logger = logger; //logger module
	this.consuler = require('consul-helper')(config.clientAgentIp); //connect to the consul agent before continuing
	this.nomader = require('nomad-helper'); //creates nomad job files easily
	this.agentAddress = config.clientAgentIp; //address of nomad and consul client agents
	this.nomadAddress = config.clientAgentIp + ":4646"; //address of nomad agents including port
	this.UserRequest = require('./UserRequest.js'); //represents a user's request for core/hmi
	this.keys = require('./constants.js').keys; //stores locations of data inside the consul KV store
	this.WaitingList = require('./WaitingList.js');
	//expecting the AWS_REGION env. if not provided, AwsHandler will simply not function
	this.AwsHandler = new require('./AwsHandler.js')
	this.AwsHandler.init(config, logger);
	this.AllocationData = require('./AllocationData.js');
	this.config = config; //config object which stores all environment variables

	//The following are utility functions that are commonly used throughout Manticore
	//determines the correct url address to use to connect to the Manticore websocket server
	/**
	* Creates the correct url to connect to Manticore's websocket servers
	* @returns {string} - The location of this web app
	*/
	this.getWsUrl = function () {
		if (!this.config.haproxy) { //no haproxy
			//given we are in a nomad-scheduled docker container, use the
			//environment variables nomad gives us to return the correct address of this manticore
			return `http://${process.env.NOMAD_IP_http}:${process.env.NOMAD_HOST_PORT_http}`;
		}
		else { //haproxy enabled
			return "//" + this.config.haproxy.domainName;
		}
	}
}

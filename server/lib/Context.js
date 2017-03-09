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
function Context (app, socketio, logger, address) {
	this.app = app; //express app
	this.socketHandler = new SocketHandler(socketio); //socket manager module
	this.logger = logger; //logger module
	this.consuler = require('consul-helper')(address); //connect to the consul agent before continuing
	this.nomader = require('nomad-helper'); //creates nomad job files easily
	this.agentAddress = address; //address of nomad and consul client agents
	this.nomadAddress = address + ":4646"; //address of nomad agents including port
	this.UserRequest = require('./UserRequest.js'); //represents a user's request for core/hmi
	this.keys = require('./constants.js').keys; //stores locations of data inside the consul KV store
	this.WaitingList = require('./WaitingList.js');
	//expecting the AWS_REGION env. if not provided, AwsHandler will simply not function
	this.AwsHandler = require('./AwsHandler.js')(process.env.AWS_REGION, logger);
	this.AllocationData = require('./AllocationData.js');

	//The following are utility functions that are commonly used throughout Manticore
	/**
	* Returns whether HAProxy should be on via HAPROXY_OFF flag
	* @returns {boolean} - Whether HAProxy should be enabled
	*/
	this.isHaProxyEnabled = function () {
		return process.env.HAPROXY_OFF !== "true";
	};
	//determines the correct url address to use to connect to the Manticore websocket server
	/**
	* Creates the correct url to connect to Manticore's websocket servers
	* @returns {string} - The location of this web app
	*/
	this.getWsUrl = function () {
		if (!this.isHaProxyEnabled()) { //no haproxy
			//given we are in a nomad-scheduled docker container, use the
			//environment variables nomad gives us to return the correct address of this manticore
			return `http://${process.env.NOMAD_IP_http}:${process.env.NOMAD_HOST_PORT_http}`;
		}
		else { //haproxy enabled
			return "//" + process.env.DOMAIN_NAME;
		}
	}
}

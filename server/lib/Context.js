//an object that manages and contains global information necessary across all modules
var SocketHandler = require('./SocketHandler.js');

module.exports = Context;

function Context (app, socketio, logger, address) {
	this.app = app; //express app
	this.socketHandler = new SocketHandler(socketio); //socket manager module
	this.logger = logger; //logger module
	this.consuler = require('consul-helper')(address); //connect to the consul agent before continuing 
	this.nomader = require('nomad-helper'); //creates nomad job files easily
	this.agentAddress = address; //address of nomad and consul client agents
	this.UserRequest = require('./UserRequest.js'); //represents a user's request for core/hmi
	this.keys = require('./constants.js').keys; //stores locations of data inside the consul KV store
	this.WaitingList = require('./WaitingList.js');

	//The following are utility functions that are commonly used throughout Manticore
	this.isHaProxyEnabled = function () {
		return process.env.HAPROXY_OFF !== "true";
	};
	//determines the correct url address to use to connect to the Manticore websocket server
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

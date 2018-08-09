
module.exports = function () {
    return new HAProxyTemplate();
};

/**
* Handles HAProxy configuration details for storage in the KV store
* @constructor
*/
function HAProxyTemplate () {
	this.webAppAddresses = [];
	this.users = {};
};

HAProxyTemplate.prototype.addUser = function (id){
	this.users[id] = {
		tcp: [],
		http: []
	};
	return this;
};

/**
* Adds the address of a manticore web server
* @param {string} address - The address of a manticore web server
* @returns {HAProxyTemplate} - HAProxyTemplate instance
*/
HAProxyTemplate.prototype.addWebAppAddress = function (address) {
	this.webAppAddresses.push(address);
	return this;
};

/**
* Adds an http route from an external address to an internal one
* @param {string} from - External address exposed to the user
* @param {string} to - Internal address exposing a service
* @returns {HAProxyTemplate} - HAProxyTemplate instance
*/
HAProxyTemplate.prototype.addHttpRoute = function (id, from, to) {
	this.users[id].http.push({
		subdomain: from,
		address: to
	});
	return this;
};

/**
* Adds a tcp port for TCP connection to core, and routes traffic to another address
* @param {number} port - External port the user uses
* @param {string} to - Internal address exposing a service
* @returns {HAProxyTemplate} - HAProxyTemplate instance
*/
HAProxyTemplate.prototype.addTcpRoute = function (id, port, to) {
	this.users[id].tcp.push({
		port: port,
		address: to
	});
	return this;
};

/*
* The users property is an object so as to identify a user by id
* This also fixes collisions in the event that a new user has the same id as a previous user
* But the kv store expects the users property to be an array of a certain format
* @returns {self} - properly formatted info for the kv-store
*
*/
HAProxyTemplate.prototype.kvFormat = function(){
	self = {
		users: []
	};
	for(var id in this.users){
		self.users.push(this.users[id]);
	}
	return self;
};
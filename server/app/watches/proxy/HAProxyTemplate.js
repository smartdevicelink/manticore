
module.exports = function () {
    return new HAProxyTemplate();
}

/**
* Handles HAProxy configuration details for storage in the KV store
* @constructor
*/
function HAProxyTemplate () {
	this.mainPort;
	this.webAppAddresses = [];
	this.tcpMaps = [];
	this.httpMaps = [];
}

/**
* Sets the port used to redirect all HTTP connections to places such as the web app and the HMI
* @param {number} port - The port number to expose on HAProxy for HTTP/WS communications
* @returns {HAProxyTemplate} - HAProxyTemplate instance
*/
HAProxyTemplate.prototype.setMainPort = function (port) {
	this.mainPort = port;
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
HAProxyTemplate.prototype.addHttpRoute = function (from, to) {
	this.httpMaps.push({
		from: from,
		to: to
	});
	return this;
};

/**
* Adds a tcp port for a single TCP connection to core, and routes traffic to another address
* @param {number} port - External port the user uses
* @param {string} to - Internal address exposing a service
* @returns {HAProxyTemplate} - HAProxyTemplate instance
*/
HAProxyTemplate.prototype.addTcpRoute = function (port, to) {
	this.tcpMaps.push({
		port: port,
		to: to
	});
	return this;
};

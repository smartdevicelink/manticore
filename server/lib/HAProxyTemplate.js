var fs = require('fs');

module.exports = function () {
    return new HAProxyTemplate();
}

//function constructor for making HAProxy conf files
function HAProxyTemplate () {
	this.mainPort;
	this.webAppAddress;
	this.tcpMaps = [];
	this.httpMaps = [];
    this.file = getTemplate();
}

//the port used to redirect all HTTP connections to places such as the web app and the HMI
HAProxyTemplate.prototype.setMainPort = function (port) {
	this.mainPort = port;
	return this;
};

//the port used to redirect all HTTP connections to places such as the web app and the HMI
HAProxyTemplate.prototype.setWebAppAddress = function (address) {
	this.webAppAddress = address;
	return this;
};

//route all traffic from one address to another
HAProxyTemplate.prototype.addHttpRoute = function (from, to) {
	this.httpMaps.push({
		from: from,
		to: to
	});
	return this;
};

//expose a port for a single TCP connection to core, and route traffic to another address
HAProxyTemplate.prototype.addTcpRoute = function (port, to) {
	this.tcpMaps.push({
		port: port,
		to: to
	});
	return this;
};

//uses all the information in the object and makes a proper HAProxy configuration file out of it
HAProxyTemplate.prototype.generate = function () {
	//first, add all the front ends. the HTTP front end binds to the main port
	this.file += `
frontend main
	bind *:${this.mainPort}
	mode http`;
	//for each http address (don't distinguish http and websocket connection)
	//create an ACL for checking the subdomain address
	for (let i = 0; i < this.httpMaps.length; i++) {
		let map = this.httpMaps[i];
		this.file += `
	acl http-front-${i} hdr_end(host) -i ${map.from}:${this.mainPort}`;	
	}

	//set up the redirections to the (currently nonexisting) backends
	for (let i = 0; i < this.httpMaps.length; i++) {
		let map = this.httpMaps[i];
		this.file += `
	use_backend http-back-${i} if http-front-${i}`;	
	}
	//set the default backend to the web app
	this.file += `
	default_backend app
`;

	//now add the TCP frontends
	for (let i = 0; i < this.tcpMaps.length; i++) {
		let map = this.tcpMaps[i];
		this.file += `
frontend tcp-front-${i}
	bind *:${map.port}
	mode tcp
	default_backend tcp-back-${i}
`;
	}

	//next, specify the backends
	//the web app backend
	this.file += `
backend app
	mode http
	server webapp ${this.webAppAddress}
`;

	//http backends
	for (let i = 0; i < this.httpMaps.length; i++) {
		let map = this.httpMaps[i];
		this.file += `
backend http-back-${i}
	mode http
	server http-server-${i} ${map.to}
`;	
	}

	//tcp backends
	for (let i = 0; i < this.tcpMaps.length; i++) {
		let map = this.tcpMaps[i];
		this.file += `
backend tcp-back-${i}
	mode tcp
	server tcp-server-${i} ${map.to}
`;	
	}

    return this.file;
}

//returns an HAProxy template
function getTemplate () {
    return fs.readFileSync(`${__dirname}/../templates/haproxyConfig`, 'utf-8');
}


var consul = require('consul')(); //start a consul agent
var functionite = require('functionite');

module.exports = {
	watchService: watchService,
	getServiceAddresses: getServiceAddresses
}

//permanently check for updates in a service you specify
function watchService (serviceName, callback) {
	//set up template object to pass through consul
	var options = {
		method: consul.catalog.service.list
	}
	let watch = consul.watch(options);
	watch.on('change', function (services, res) {
		//everytime a change is detected, get the updated list of services
		//filter the services so only those with name serviceName are passed back
		functionite()
		.to(getNodes)
		.to(getServicesInNodes)
		.to(filterWatches, serviceName)
		.then(function (results) {
			callback(results[0]);
		});
	});
	watch.on('error', function (err) {
		throw err;
	});

}

function filterWatches (services, serviceName, callback) {
	var filteredServices = [];
	for (let i in services) {
		if (services[i].Service == serviceName) {
			filteredServices.push(services[i]);
		}
	}
	callback(filteredServices);
}

//pass in a consul service name and return addresses of all those services
function getServiceAddresses (serviceName, callback) {
	functionite()
	.to(getNodes)
	.to(getServicesInNodes)
	.to(getAddressesFromService, serviceName)
	.then(function (results) {
		callback(results[0]);
	});
}

/** HELPER FUNCTIONS **/

//get all nodes in Consul
function getNodes (callback) {
	consul.catalog.node.list(function (err, results) {
		if (err) throw err;
		//parse out the node names
		var nodes = [];
		for (let i = 0; i < results.length; i++) {
			nodes.push(results[i]["Node"]);
		}
		callback(nodes);
	});
}

//get all running services managed by all the nodes supplied in the argument
function getServicesInNodes (nodes, callback) {
	var services = [];
	var nodeCount = nodes.length;
	for (let i in nodes) {
		consul.catalog.node.services(nodes[i], function (err, results) {
			if (err) throw err;
			let servicesTrim = trimServicesResponse(results);
			//append elements to final services array
			for (let j in servicesTrim) {
				services.push(servicesTrim[j]);
			}
			checkDone();
		});
	}
	function checkDone () {
		nodeCount--;
		if (nodeCount === 0) {
			callback(services);
		}
	}
}

//takes in the results of all services a node manages and trims them
//so that only an array of services remain. It makes an array, not an object
function trimServicesResponse (services) {
	services = services.Services; //discard Node information
	var flatServices = [];
	for (let property in services) {
		if (services.hasOwnProperty(property)) {
			//only push service information, and don't include the object name
			flatServices.push(services[property]);
		}
	}
	return flatServices;
}

//get IP and port info from all services with a certain name
function getAddressesFromService (services, serviceName, callback) {
	var addresses = [];
	//go through each running service and determine if it's the service we are looking for
	for (let i in services) {
		//get the service name of the object and compare to serviceName
		if (services[i]["Service"] === serviceName) {
			//it's the service we want. extract address info
			let address = {
				"ip": services[i]["Address"],
				"port": services[i]["Port"]
			}
			addresses.push(`${address.ip}:${address.port}`);
		}
	}
	callback(addresses);
}
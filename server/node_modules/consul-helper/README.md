Do you have a Consul cluster running?

Do you have a local consul agent connected to the cluster?

Good. You can use this package.

This package is not meant for general use and is used specifically for Manticore

How can you use it? Like this:
```
var consuler = require('consul-helper');
const serviceName = "service-name";

//check for changes in all services in a datacenter, but return information of one service
consuler.watchService(serviceName, function (services) {
	console.log(services);
	//retrieve address and port information of all services of a certain name
	consuler.getServiceAddresses(serviceName, function (results) {
		if (results.length > 0) {
			console.log(results);
		}
		else {
			console.log("No servers found");
		}
	});
});

```
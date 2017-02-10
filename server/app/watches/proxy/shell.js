var functionite = require('functionite');
var HAProxyTemplate = require('./HAProxyTemplate.js');

module.exports = {
	generateProxyData: function (context, pairs, manticores) {
		var pairs = pairs.pairs;
		//for each pair, extract connection information and add them to HAProxy config file
		//put TCP blocks in a separate file
		var file = HAProxyTemplate();
		file.setMainPort(process.env.HAPROXY_HTTP_LISTEN);

		for (let i = 0; i < manticores.length; i++) {
			var manticore = manticores[i];
			file.addWebAppAddress(manticore.Address + ":" + manticore.Port);
		}

		//generate a number of unique ports equal to the number of pairs
		//add the routes routes
		for (let i = 0; i < pairs.length; i++) {
			//generate a random port number in a range specified by environment variables
			//to pick as an exposed port for a TCP connection
			let pair = pairs[i];

			file.addHttpRoute(pair.userAddressExternal, pair.userAddressInternal)
				.addHttpRoute(pair.hmiAddressExternal, pair.hmiAddressInternal)
				.addHttpRoute(pair.brokerAddressExternal, pair.brokerAddressInternal)
				.addTcpRoute(pair.tcpPortExternal, pair.tcpAddressInternal)
		}
		return file;
	},
	updateKvStore: function (context, template) {
		//use the HAProxyTemplate file to submit information to the KV store so that
		//consul-template can use that information to generate an HAProxy configuration
		//replace existing data in the KV store
		var lock;

		functionite()
		.pass(function (callback) {
			//lock functionality
			//lock = context.consuler.lock(context.keys.haproxy + "/"); //lock the directory
			//lock.on('acquire', function () {
				callback(); //continue
			//});
			//lock.on('end', function () {
			//	context.logger.debug("Manticore instance at " + process.env.NOMAD_IP_http + " is done with lock!");
			//});
			//lock.acquire();
		})
		.toss(context.consuler.delKeyAll, context.keys.data.haproxy) //reset everything under haproxy in KV store
		.toss(function () {
			//how many async calls we need to make in total
			var totalRequests = template.webAppAddresses.length + template.tcpMaps.length + (2*template.httpMaps.length);

			for (let i = 0; i < template.webAppAddresses.length; i++) {
				var item = template.webAppAddresses[i];
				(function (index) {
					context.consuler.setKeyValue(context.keys.haproxy.webApp + "/" + index, item, function () {
						check();
					});
				})(i);
			}	
			for (let i = 0; i < template.tcpMaps.length; i++) {
				var item = template.tcpMaps[i];
				(function (index){
					context.consuler.setKeyValue(context.keys.haproxy.tcpMaps + "/" + item.port, item.to, function (){
						check();
					});
				})(i);
			}	
			for (let i = 0; i < template.httpMaps.length; i++) {
				var item = template.httpMaps[i];
				(function (index) {
					context.consuler.setKeyValue(context.keys.haproxy.httpFront + "/" + index, item.from, function (){
						check();
					});
					context.consuler.setKeyValue(context.keys.haproxy.httpBack + "/" + index, item.to, function (){
						check();
					});
				})(i);
			}				

			function check () {
				//async call complete
				totalRequests--;
				if (totalRequests === 0) { //all async calls are complete
					//lock.release(); //done with the lock
				}
			}
		})
		.go();
	},
	updateManticoreKvStore: function (context, template) {
		//only update manticore web app addresses!
		functionite()
		.toss(context.consuler.delKeyAll, context.keys.haproxy.webApp) //reset only web app addresses!
		.toss(function () {
			for (let i = 0; i < template.webAppAddresses.length; i++) {
				var item = template.webAppAddresses[i];
				(function (index) {
					context.consuler.setKeyValue(context.keys.haproxy.webApp + "/" + index, item, function () {});
				})(i);
			}	
		})
		.go();
	}
}
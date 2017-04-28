var HAProxyTemplate = require('./HAProxyTemplate.js');

/** @module app/watches/proxy/shell */

module.exports = {
	/**
	* Generate a template of routing configurations for HAProxy
	* @param {Context} context - Context instance
	* @param {array} pairs - An array of pair objects. Currently not defined
	* @param {array} manticores - An array of service objects, returned by Consul's service watches
	* @returns {HAProxyTemplate} - A template of routing configurations 
	*/
	generateProxyData: function (context, pairs, manticores) {
		//for each pair, extract connection information and add them to HAProxy config file
		//put TCP blocks in a separate file
		var file = HAProxyTemplate();
		file.setMainPort(context.config.haproxy.httpListen);

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
	/**
	* Updates the KV store with new information from a template for core/hmi routing
	* @param {Context} context - Context instance
	* @param {HAProxyTemplate} template - Template storing routing configurations
	*/
	updateCoreHmiKvStore: function (context, template) {
		//use the HAProxyTemplate file to submit information to the KV store so that
		//consul-template can use that information to generate an HAProxy configuration
		//replace everything under haproxy/data, which includes http and tcp mappings
		var jsonObj = {
			users: []
		}

		//3 haproxy routes and 1 tcp route per user
		//transform into a json object that consul-template can parse
		for (let i = 0; i < template.tcpMaps.length; i++) {
			var user = {};
			user.tcp = {};
			user.http = [];
			user.tcp.address = template.tcpMaps[i].to;
			user.tcp.port = template.tcpMaps[i].port;
			user.http.push({
				subdomain: template.httpMaps[i*3].from,
				address: template.httpMaps[i*3].to
			});
			user.http.push({
				subdomain: template.httpMaps[i*3+1].from,
				address: template.httpMaps[i*3+1].to
			});
			user.http.push({
				subdomain: template.httpMaps[i*3+2].from,
				address: template.httpMaps[i*3+2].to
			});
			jsonObj.users.push(user);
		}	
		context.consuler.setKeyValue(context.keys.haproxy.templateData, JSON.stringify(jsonObj), function (){});;
	},
	/**
	* Updates the KV store with new information from a template for Manticore routing
	* @param {Context} context - Context instance
	* @param {HAProxyTemplate} template - Template storing routing configurations
	*/
	updateManticoreKvStore: function (context, template) {
		//only update manticore web app addresses!
		//reset only web app addresses!
		context.consuler.delKeyAll(context.keys.haproxy.webApp, function () {
			for (let i = 0; i < template.webAppAddresses.length; i++) {
				let item = template.webAppAddresses[i];
				context.consuler.setKeyValue(context.keys.haproxy.webApp + "/" + i, item, function () {});
			}				
		});
	}
}
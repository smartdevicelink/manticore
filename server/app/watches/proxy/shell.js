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
	/**
	* Updates the KV store with new information from a template for core/hmi routing
	* @param {Context} context - Context instance
	* @param {HAProxyTemplate} template - Template storing routing configurations
	*/
	updateCoreHmiKvStore: function (context, template) {
		//use the HAProxyTemplate file to submit information to the KV store so that
		//consul-template can use that information to generate an HAProxy configuration
		//replace everything under haproxy/data, which includes http and tcp mappings
		context.consuler.delKeyAll(context.keys.data.haproxy, function () {
			for (let i = 0; i < template.tcpMaps.length; i++) {
				let item = template.tcpMaps[i];
				context.consuler.setKeyValue(context.keys.haproxy.tcpMaps + "/" + item.port, item.to, function (){});
			}	
			for (let i = 0; i < template.httpMaps.length; i++) {
				let item = template.httpMaps[i];
				context.consuler.setKeyValue(context.keys.haproxy.httpFront + "/" + i, item.from, function (){});
				context.consuler.setKeyValue(context.keys.haproxy.httpBack + "/" + i, item.to, function (){});
			}	
		});
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
const config = require('./config.js');
const HAProxyTemplate = require('./HAProxyTemplate.js');
const randomString = require('randomatic');
const pattern = 'a0';
//const {store, job, logger} = config;
const consul = require('../../store/consul-kv/index.js');

function getInternalAddress(addressName){
	return consul.cas(`haproxy/${addressName}`);
}

function setInternalAddress(addressName){
	let name = randomString(pattern, 16);
	consul.set({
		key: `haproxy/${addressName}`,
		value: name
	});
	return name;
}

function checkInternalAddress(addressName){
	let name = getInternalAddress(addressName).data;
	if(name){
		return name;
	}
	return setInternalAddress(addressName);
}

module.exports = {
    generateProxyData: async function(id, currentRequest){
	    consulStrings = {}
	    consulStrings[`core-broker-${id}`] = checkInternalAddress(`core-broker-${id}`);
	    consulStrings[`core-file-${id}`] = checkInternalAddress(`core-file-${id}`);
	    consulStrings[`core-log-${id}`] = checkInternalAddress(`core-log-${id}`);
	    consulStrings[`hmi-user-${id}`] = checkInternalAddress(`hmi-user-${id}`);
	    consulStrings[`core-tcp-${id}`] = Math.floor(Math.random() * 10000)

    	let file = HAProxyTemplate();

    	file.setMainPort(config.haproxyPort);

    	file.addHttpRoute(currentRequest.hmi[`hmi-user-${id}`], consulStrings[`hmi-user-${id}`])
			.addHttpRoute(currentRequest.core[`core-file-${id}`], consulStrings[`core-file-${id}`])
			.addHttpRoute(currentRequest.core[`core-broker-${id}`], consulStrings[`core-broker-${id}`])
			.addHttpRoute(currentRequest.core[`core-log-${id}`], consulStrings[`core-log-${id}`])
			.addTcpRoute(consulStrings[`core-tcp-${id}`], currentRequest.core[`core-tcp-${id}`]);
    	return file;
    },
    updateCoreHmiKvStore: async function(ctx, template){
    	var jsonObj = {
    		users: []
    	}

    	for(let i = 0; i < template.tcpMaps.length; i++){
    		let user = {};
    		user.tcp = {};
    		user.http = [];
    		user.tcp.address = template.tcpMaps[i].to;
    		user.tcp.port = template.tcpMaps[i].port;
    		user.http.push({
    			subdomain: template.httpMaps[i*4].to,
    			address: template.httpMaps[i*4].from
    		});
    		user.http.push({
    			subdomain: template.httpMaps[i*4 + 1].to,
    			address: template.httpMaps[i*4 + 1].from
    		});
    		user.http.push({
    			subdomain: template.httpMaps[i*4 + 2].to,
    			address: template.httpMaps[i*4 + 2].from
    		});
    		user.http.push({
    			subdomain: template.httpMaps[i*4 + 3].to,
    			address: template.httpMaps[i*4 + 3].from
    		});
    		jsonObj.users.push(user);
    	}
    	await consul.set({
    		key: 'haproxy/mainPort',
    		value: template.mainPort
    	})
    	await consul.set({
    		key: 'haproxy/webAppAddresses',
    		value: template.webAppAddresses
    	})
    	await consul.set({
    		key: 'haproxy/domainName',
    		value: config.domainName //move this somewhere where config.haproxy exists
    	})
    	await consul.set({
    		key: 'templateData',
    		value: JSON.stringify(jsonObj)
    	});
    }
}
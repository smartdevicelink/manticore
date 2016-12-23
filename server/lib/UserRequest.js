var randomstring = require('randomstring');

module.exports = function (body) {
    return new UserRequest(body);
}

//put the information from the endpoint request into this
function UserRequest (body) {
	if (body === undefined) {
		body = {};
	}
	this.id = body.id;
	this.url = body.url;
	this.build = body.build;
	this.branch = body.branch;
	this.hmiName = body.hmiName;
	this.userToHmiPrefix = body.userToHmiPrefix;
	this.hmiToCorePrefix = body.hmiToCorePrefix;
	this.tcpPortExternal = body.tcpPortExternal;
	this.brokerAddressPrefix = body.brokerAddressPrefix;
	this.tcpPortInternal = body.tcpPortInternal;
	this.brokerPortInternal = body.brokerPortInternal;
}

//make a JSON object out of the information, and stringify it
UserRequest.prototype.getString = function () {
	return JSON.stringify({
		id: this.id,
		url: this.url,
		build: this.build,
		branch: this.branch,
		hmiName: this.hmiName,
		userToHmiPrefix: this.userToHmiPrefix,
		hmiToCorePrefix: this.hmiToCorePrefix,
		tcpPortExternal: this.tcpPortExternal,
		brokerAddressPrefix: this.brokerAddressPrefix,
		tcpPortInternal: this.tcpPortInternal,
		brokerPortInternal: this.brokerPortInternal
	});
}

//these two functions truncate the data to send to the tags in nomad/consul
//still investigating why this prevents issues with consul's services watch
UserRequest.prototype.toCoreTag = function () {
	return JSON.stringify({
		id: this.id,
		tcpPortInternal: this.tcpPortInternal,
		userToHmiPrefix: this.userToHmiPrefix,
		hmiToCorePrefix: this.hmiToCorePrefix,
		tcpPortExternal: this.tcpPortExternal,
		brokerAddressPrefix: this.brokerAddressPrefix,
	});
}

UserRequest.prototype.toHmiTag = function () {
	return JSON.stringify({
		id: this.id,
		brokerPortInternal: this.brokerPortInternal,
	});
}

//the inverse of the getString function
UserRequest.prototype.parse = function (string) {
	return new UserRequest(JSON.parse(string));
}

//use the additional information from core and hmi to make a user-readable response
//about connection information
UserRequest.prototype.generatePairInfo = function (corePair, hmiPair) {
	//broker port will be located inside the hmiPair
	var hmiRequest = new UserRequest().parse(hmiPair.Tags[0]);
	return {
		id: this.id,
		userAddressInternal: hmiPair.Address + ":" + hmiPair.Port,
		hmiAddressInternal: corePair.Address + ":" + corePair.Port,
		tcpAddressInternal: corePair.Address + ":" + this.tcpPortInternal,
		brokerAddressInternal: hmiPair.Address + ":" + hmiRequest.brokerPortInternal,
		userAddressExternal: this.userToHmiPrefix,
		hmiAddressExternal: this.hmiToCorePrefix,
		tcpPortExternal: this.tcpPortExternal,
		brokerAddressExternal: this.brokerAddressPrefix
	}
}

//make some dummy data that a user request would have before manipulating the request info
UserRequest.prototype.generateDataInitial = function () {
	var request = new UserRequest();
	request.id = randomstring.generate(10);
	request.url = randomstring.generate(10);
	request.build = randomstring.generate(10)
	request.branch = randomstring.generate(10);
	request.hmiName = randomstring.generate(10);
	request.userToHmiPrefix = randomstring.generate(10);
	request.hmiToCorePrefix = randomstring.generate(10);
	request.tcpPortExternal = randomstring.generate(10);
	request.brokerAddressPrefix = randomstring.generate(10);
	request.tcpPortInternal = undefined;
	request.brokerPortInternal = undefined;
	return request;
}

//make some dummy data that a core service would have
UserRequest.prototype.generateDataCore = function () {
	var request = new UserRequest();
	request.id = randomstring.generate(10);
	request.url = randomstring.generate(10);
	request.build = randomstring.generate(10)
	request.branch = randomstring.generate(10);
	request.hmiName = randomstring.generate(10);
	request.userToHmiPrefix = randomstring.generate(10);
	request.hmiToCorePrefix = randomstring.generate(10);
	request.tcpPortExternal = randomstring.generate(10);
	request.brokerAddressPrefix = randomstring.generate(10);
	request.tcpPortInternal = randomstring.generate(10); //specific to core
	request.brokerPortInternal = undefined;
	return request;
}

//make some dummy data that an hmi service would have
UserRequest.prototype.generateDataHmi = function () {
	var request = new UserRequest();
	request.id = randomstring.generate(10);
	request.url = randomstring.generate(10);
	request.build = randomstring.generate(10);
	request.branch = randomstring.generate(10);
	request.hmiName = randomstring.generate(10);
	request.userToHmiPrefix = randomstring.generate(10);
	request.hmiToCorePrefix = randomstring.generate(10);
	request.tcpPortExternal = randomstring.generate(10);
	request.brokerAddressPrefix = randomstring.generate(10);
	request.tcpPortInternal = undefined;
	request.brokerPortInternal = randomstring.generate(10); //specific to hmi
	return request;
}
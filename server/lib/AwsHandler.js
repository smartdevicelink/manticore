var AWS = require('aws-sdk');
var ec2 = new AWS.EC2();
var elb = new AWS.ELB();

//further requirements: Will use the IAM role associated with the machine Manticore runs in
//in order to deal with credentials for using Amazon's API. Make sure the instances are
//launched with an IAM role that is allowed to configure EC2 instance data such as 
//ELBs and security groups
//see http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RegionsAndAvailabilityZones.html
//for a list of regions to choose from

//also, an SSL certificate should already exist that is meant for the ELB that will distribute traffic
//to manticore, where the domain name that certificate covers matches the DOMAIN_NAME env var passed in
module.exports = function (region) {
    return new AwsHandler(region);
};

//a module that connects to AWS in order to change information such as the ELB
function AwsHandler (region) {
	if (region) { //only do things if region exists
		AWS.config.update({region: region});
	}
	this.addListener("SSL", 5000, true);
}

AwsHandler.prototype.addListener = function (protocol, port, includeCertificate) {
	var listenerObj = {
		InstancePort: port, //inner port
		LoadBalancerPort: port, //outer port
		Protocol: protocol,
		InstanceProtocol: protocol,
	}
	if (includeCertificate) {
		listenerObj.SSLCertificateId = process.env.SSL_CERTIFICATE_ID;
	}

	var params = {
		Listeners: [
			listenerObj
		],
		LoadBalancerName: process.env.ELB_MANTICORE_NAME
	};
	elb.createLoadBalancerListeners(params, function (err, data) {
		console.error(data);
	});
}

AwsHandler.prototype.removeListener = function (port) {
	var params = {
		LoadBalancerPorts: [port],
		LoadBalancerName: process.env.ELB_MANTICORE_NAME
	};
	elb.deleteLoadBalancerListeners(params, function (err, data) {
		console.error(data);
	});
}

//example
/*var params = {
	LoadBalancerNames: [process.env.ELB_MANTICORE_NAME],
}
elb.describeLoadBalancers(params, function (err, data) {
	//check if we got the load balancer that was requested via env variable
	if (data && data.LoadBalancerDescriptions && data.LoadBalancerDescriptions[0]) {
		var lbStatus = data.LoadBalancerDescriptions[0];
		//lbStatus's ListenerDescriptions property describes open ports and stuff
		console.error(JSON.stringify(lbStatus));
	}
});*/
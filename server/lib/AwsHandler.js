var AWS = require('aws-sdk');
var elb = new AWS.ELB();
var cloudWatch = new AWS.CloudWatch();
var logger;

module.exports = AwsHandler;

/**
* Allows usage of the AWS SDK API
* @constructor
*/
function AwsHandler () {
	this.config; //config object
}

/**
* Sets up AwsHandler with logging 
* @param {string} region - The AWS region to be used (ex. us-east-1)
* @param {winston.Logger} log - An instance of the logger to use
* @returns {AwsHandler} - An AwsHandler object
*/
AwsHandler.prototype.init = function (config, log) {
	logger = log;
	this.config = config;
	if (this.config.aws) { //only do things if AWS is enabled
		AWS.config.update({region: this.config.aws.awsRegion});
	}
};

//ELB CODE HERE

/**
* Given a template generated from HAProxyTemplate.js, update the ELB with the new port data
* @param {HAProxyTemplate} template - Information meant for consumption by HAProxy
*/
AwsHandler.prototype.changeState = function (template) {
	if (!this.config.aws || !this.config.aws.elb) {
		return; //do nothing if ELB isn't enabled
	}
	var self = this; //consistent reference to 'this'
	//get the current state
	this.describeLoadBalancer(function (lbStatus) {
		//get listener information
		var actualListeners = [];
		for (let i = 0; i < lbStatus.ListenerDescriptions.length; i++) {
			actualListeners.push(new Listener(lbStatus.ListenerDescriptions[i].Listener));
		}	

		//first, find and remove all ports that don't need to be listened on anymore
		//then, find and add all ports that need to be listened on
		//port 443 should always be open for HTTPS connections
		//the websocket connections should always be open to whatever ELB_SSL_PORT is 		
		var expectedListeners = [new Listener({
			Protocol: "HTTPS",
			LoadBalancerPort: 443,
			InstanceProtocol: "HTTP",
			InstancePort: self.config.haproxy.httpListen, 
			SSLCertificateId: self.config.aws.elb.sslCertificateArn
		}),
		new Listener({
			Protocol: "SSL",
			LoadBalancerPort: self.config.aws.elb.sslPort, 
			InstanceProtocol: "TCP",
			InstancePort: self.config.haproxy.httpListen, 
			SSLCertificateId: self.config.aws.elb.sslCertificateArn
		})];

		//get tcp mappings. we are only interested in an array of ports that should be opened
		for (let i = 0; i < template.tcpMaps.length; i++) {
			expectedListeners.push(new Listener({
				Protocol: "TCP",
				LoadBalancerPort: template.tcpMaps[i].port,
				InstanceProtocol: "TCP",
				InstancePort: template.tcpMaps[i].port
			}));
		}
		//determine which listeners need to be added and which need to be removed
		var listenerChanges = AwsHandler.calculateListenerChanges(expectedListeners, actualListeners);
		//ALWAYS remove unneeded listeners before adding needed listeners
		self.removeListeners(listenerChanges.toBeDeletedListeners, function () {
			self.addListeners(listenerChanges.toBeAddedListeners, function () {
				//done!
			});
		});
	}); 
}

/**
* Determines what the new state of the ELB listeners should be using differences. Static method
* @param {Listener} expectedListeners - The Listeners that should exist
* @param {Listener} actualListeners - What Listeners are currently on the ELB
* @returns {object} listenerChanges - Describes changes necessary to the ELB
* @returns {array} listenerChanges.toBeDeletedListeners - An array of port numbers to be removed from the ELB
* @returns {array} listenerChanges.toBeAddedListeners - An array of Listener objects to be added to the ELB
*/
AwsHandler.calculateListenerChanges = function (expectedListeners, actualListeners) {
	var listenerChanges = {
		toBeDeletedListeners: [], //NOTE: only save the LoadBalancer ports of the listeners here!
		toBeAddedListeners: []
	}
	//with some clever foresight, we won't need two sets of nested for loops to get
	//all the information we need
	//what is crucial about this algorithm is that the LoadBalancerPort number must be unique 
	//across all other listeners in an array
	//sort the arrays in ascending order using the LoadBalancerPort as the comparing element
	expectedListeners.sort(function (a, b) {
		return a.LoadBalancerPort - b.LoadBalancerPort;
	});
	actualListeners.sort(function (a, b) {
		return a.LoadBalancerPort - b.LoadBalancerPort;
	});

	//require both arrays must contain elements for an investigation
	while (expectedListeners.length > 0 && actualListeners.length > 0) {
		//take the expected and current listener with the next lowest LB port number
		var expected = expectedListeners[0];
		var actual = actualListeners[0];
		var comparison = AwsHandler.comparelistenerStates(expected, actual);
		if (comparison.diff < 0) { 
			//an expected listener is missing. add expected listener into toBeAddedListeners
			listenerChanges.toBeAddedListeners.push(expectedListeners.shift()); 
		}
		else if (comparison.diff > 0) { 
			//an actual listener needs to be removed. add listener's port to toBeDeletedListeners
			listenerChanges.toBeDeletedListeners.push(actualListeners.shift().LoadBalancerPort);
		}
		else {
			//LB ports of both listeners are equal.
			if (comparison.equivalent) {
				//matching listeners. do nothing to change the state
				expectedListeners.shift();
				actualListeners.shift();
			} else { 
				//listeners do not match. we must update the listener with this port
				//remove actual listener and add expected listener
				listenerChanges.toBeAddedListeners.push(expectedListeners.shift()); 
				listenerChanges.toBeDeletedListeners.push(actualListeners.shift().LoadBalancerPort);
			}
		}
	}
	//one of the arrays are depleted
	//all remaining listeners in expected array need to be added
	//all remaining listeners in actual array need to be removed
	while (expectedListeners.length > 0) {
		listenerChanges.toBeAddedListeners.push(expectedListeners.shift()); 
	}
	while (actualListeners.length > 0) {
		listenerChanges.toBeDeletedListeners.push(actualListeners.shift().LoadBalancerPort); 
	}
	//finally complete!
	return listenerChanges;
}

/**
* Determines whether two Listener objects are equivalent, and which listener LoadBalancer port is higher. Static method
* @param {Listener} listener1 - A Listener to compare against
* @param {Listener} listener2 - A Listener to compare against
* @returns {object} status - States the relationship between Listener objects
* @returns {boolean} status.equivalent - States whether the Listener objects are equivalent
* @returns {number} status.diff - The difference between two Listener objects' LoadBalancer ports
*/
AwsHandler.comparelistenerStates = function (listener1, listener2) {
	var status = {
		equivalent: true,
		diff: 0
	}
	status.diff = listener1.LoadBalancerPort - listener2.LoadBalancerPort;
	//most common check is if the LB port numbers are equivalent, so check that first
	if (listener1.LoadBalancerPort !== listener2.LoadBalancerPort
		|| listener1.Protocol !== listener2.Protocol
		|| listener1.InstanceProtocol !== listener2.InstanceProtocol
		|| listener1.InstancePort !== listener2.InstancePort
		|| listener1.SSLCertificateId !== listener2.SSLCertificateId) {
		status.equivalent = false;
	}
	return status;
}

/**
* Finds the current state of Listeners on the ELB
* @param {AwsHandler~describeLoadBalancerCallback} callback - callback
*/
AwsHandler.prototype.describeLoadBalancer = function (callback) {
	var params = {
		LoadBalancerNames: [this.config.aws.elb.manticoreName],
	}
	elb.describeLoadBalancers(params, function (err, data) {
		//check if we got the load balancer that was requested via env variable
		if (data && data.LoadBalancerDescriptions && data.LoadBalancerDescriptions[0]) {
			var lbStatus = data.LoadBalancerDescriptions[0];
			//lbStatus's ListenerDescriptions property describes open ports and stuff
			callback(lbStatus);
		}
	});
}
/**
 * Callback object for AwsHandler.describeLoadBalancer
 * @callback AwsHandler~describeLoadBalancerCallback
 * @param {object} lbStatus - An AWS response object describing everything about the ELB
 */


/**
* Adds listeners to the ELB
* @param {array} listeners - An array of Listener objects
* @param {function} callback - empty callback
*/
AwsHandler.prototype.addListeners = function (listeners, callback) {
	var params = {
		Listeners: listeners,
		LoadBalancerName: this.config.aws.elb.manticoreName
	};
	if (listeners.length > 0) { //only make a call if listeners has data
		elb.createLoadBalancerListeners(params, function (err, data) {
			if (err) {
				logger.error(err);
			}
			callback();
		});		
	}
	else {
		callback();
	}
}

/**
* Removes listeners from the ELB
* @param {array} lbPorts - An array of numbers that are port numbers
* @param {function} callback - empty callback
*/
AwsHandler.prototype.removeListeners = function (lbPorts, callback) {
	var params = {
		LoadBalancerPorts: lbPorts,
		LoadBalancerName: this.config.aws.elb.manticoreName
	};
	if (lbPorts.length > 0) {
		elb.deleteLoadBalancerListeners(params, function (err, data) {
			if (err) {
				logger.error(err);
			}
			callback();
		});		
	}
	else {
		callback();
	}
}

/**
* Inner class that describes an ELB listener
* @constructor
* @param {object} body - The format of the data
* @param {string} body.Protocol - Protocol that is used for accepting public-facing traffic (ex. HTTPS, SSL)
* @param {number} body.LoadBalancerPort - The port that's opened for accepting public-facing traffic
* @param {string} body.InstanceProtocol - Protocol that is used for sending traffic internally (ex. HTTP, TCP)
* @param {number} body.InstancePort - The port that's opened for the sending traffic internally
* @param {string} body.SSLCertificateId - The ARN of the SSL certificate used for allowing HTTPS and SSL protocols
*/
function Listener (body) {
	this.Protocol = body.Protocol;
	this.LoadBalancerPort = body.LoadBalancerPort;
	this.InstanceProtocol = body.InstanceProtocol;
	this.InstancePort = body.InstancePort;
	this.SSLCertificateId = body.SSLCertificateId;
}


//CLOUDWATCH CODE HERE
/**
* Publishes a metric to CloudWatch
* @param {string} metricName - Name of the metric
* @param {string} unitName - The unit the metric is measured in
* @param {number} value - Value of the metric
*/
AwsHandler.prototype.publish = function (metricName, unitName, value) {
	if (this.config.aws && this.config.aws.cloudWatch) { //only do things if CloudWatch is enabled
		/*
			{
				Name: "IP",
				Value: this.config.clientAgentIp
			}
		*/
		var params = {
			Namespace: this.config.aws.cloudWatch.namespace,
			MetricData: [
				{
					MetricName: metricName,
					Dimensions: [],
					Timestamp: new Date(),
					Unit: unitName,
					Value: value
				}
			]
			//use the dimensions property to show where each log came from by IP
			//so we can filter the metrics based on reports of one Manticore web app
		};
		cloudWatch.putMetricData(params, function (err, data) {});	
	}
};
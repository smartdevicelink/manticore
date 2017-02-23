var AWS = require('aws-sdk');
var ec2 = new AWS.EC2();
var elb = new AWS.ELB();
var logger;
//further requirements: Will use the IAM role associated with the machine Manticore runs in
//in order to deal with credentials for using Amazon's API. Make sure the instances are
//launched with an IAM role that is allowed to configure EC2 instance data such as 
//ELBs and security groups
//see http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RegionsAndAvailabilityZones.html
//for a list of regions to choose from

//also, an SSL certificate should already exist that is meant for the ELB that will distribute traffic
//to manticore, where the domain name that certificate covers matches the DOMAIN_NAME env var passed in

//furthermore, manticore will not edit any security group attached to your ELB, since there
//could be multiple security groups, some of which you do not want to be edited. it is your
//responsibility to ensure that the range of ports that are allowable for the security group
//match the range you specified in the env variables TCP_PORT_RANGE_START and TCP_PORT_RANGE_END
module.exports = function (region, log) {
	logger = log;
    return new AwsHandler(region);
};

//a module that connects to AWS in order to change information such as the ELB
function AwsHandler (region) {
	if (region) { //only do things if region exists
		AWS.config.update({region: region});
	}
}

//given a template generated from HAProxyTemplate.js, update the ELB
//with the new port data
AwsHandler.prototype.changeState = function (template) {
	//get the current state
	this.describeLoadBalancer(function (lbStatus) {
		console.error(JSON.stringify(lbStatus, null, 2));
		console.error(JSON.stringify(template, null, 2));
		//get listener information
		var actualListeners = lbStatus.ListenerDescriptions;	

		//first, find and remove all ports that don't need to be listened on anymore
		//then, find and add all ports that need to be listened on
		//port 443 should always be open for HTTPS connections
		//the websocket connections should always be open to whatever ELB_SSL_PORT is 		
		var expectedListeners = [{
			Protocol: "HTTPS",
			LoadBalancerPort: 443,
			InstanceProtocol: "HTTP",
			InstancePort: 80,
			SSLCertificateId: process.env.SSL_CERTIFICATE_ARN
		},
		{
			Protocol: "SSL",
			LoadBalancerPort: process.env.ELB_SSL_PORT,
			InstanceProtocol: "TCP",
			InstancePort: 80,
			SSLCertificateId: process.env.SSL_CERTIFICATE_ARN
		}];

		//get tcp mappings. we are only interested in an array of ports that should be opened
		for (let i = 0; i < template.tcpMaps.length; i++) {
			expectedListeners.push({
				protocol: "TCP",
				port: tcpMaps[i].port
			});
		}
		//determine which listeners need to be added and which need to be removed
		var listenerChanges = this.calculateListenerChanges(expectedListeners, actualListeners);
		//ALWAYS remove unneeded listeners before adding needed listeners
		logger.debug(JSON.stringify(listenerChanges, null, 2));
		this.removeListeners(listenerChanges.toBeDeletedListeners, function () {
			this.addListeners(listenerChanges.toBeAddedListeners, function () {
				//done!
			});
		});
	}); 
}

AwsHandler.prototype.calculateListenerChanges = function (expectedListeners, actualListeners) {
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
		var comparison = this.comparelistenerStates(expected, actual);
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

AwsHandler.prototype.comparelistenerStates = function (listener1, listener2) {
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

AwsHandler.prototype.describeLoadBalancer = function (callback) {
	var params = {
		LoadBalancerNames: [process.env.ELB_MANTICORE_NAME],
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

AwsHandler.prototype.addListeners = function (listeners, callback) {
	var params = {
		Listeners: listeners,
		LoadBalancerName: process.env.ELB_MANTICORE_NAME
	};
	elb.createLoadBalancerListeners(params, function (err, data) {
		if (err) {
			logger.error(err);
		}
		callback();
	});
}

AwsHandler.prototype.removeListeners = function (lbPorts, callback) {
	var params = {
		LoadBalancerPorts: lbPorts,
		LoadBalancerName: process.env.ELB_MANTICORE_NAME
	};
	elb.deleteLoadBalancerListeners(params, function (err, data) {
		if (err) {
			logger.error(err);
		}
		callback();
	});
}

/*
	var listenerObj = {
		InstancePort: 80, //inner port
		LoadBalancerPort: 5000, //outer port
		Protocol: "SSL",
		InstanceProtocol: "TCP",
		SSLCertificateId: process.env.SSL_CERTIFICATE_ARN
	}
	this.describeLoadBalancer();
*/

/*
AwsHandler.prototype.addPortRule = function () {
var params = {
	GroupId: process.env.ELB_SECURITY_GROUP_ID,
	FromPort: 0,
  IpPermissions: [
    {
      FromPort: 0,
      IpProtocol: 'STRING_VALUE',
      IpRanges: [
        {
          CidrIp: 'STRING_VALUE'
        },
      ],
      Ipv6Ranges: [
        {
          CidrIpv6: 'STRING_VALUE'
        },
      ],
      PrefixListIds: [
        {
          PrefixListId: 'STRING_VALUE'
        },
      ],
      ToPort: 0,
      UserIdGroupPairs: [
        {
          GroupId: 'STRING_VALUE',
          GroupName: 'STRING_VALUE',
          PeeringStatus: 'STRING_VALUE',
          UserId: 'STRING_VALUE',
          VpcId: 'STRING_VALUE',
          VpcPeeringConnectionId: 'STRING_VALUE'
        },
      ]
    },
  ],
  IpProtocol: 'STRING_VALUE',
  SourceSecurityGroupName: 'STRING_VALUE',
  SourceSecurityGroupOwnerId: 'STRING_VALUE',
  ToPort: 0
};
ec2.authorizeSecurityGroupEgress(params, function(err, data) {
  if (err) console.log(err, err.stack); // an error occurred
  else     console.log(data);           // successful response
});	
	
}*/
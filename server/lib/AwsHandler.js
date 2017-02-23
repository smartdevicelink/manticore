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
//could be multiple security groups, some of which should not be edited. it is your
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
	//first, find and remove all ports that don't need to be listened on anymore
	//then, find and add all ports that need to be listened on
	//port 443 should always be open for the sake of HTTPS connections
	//the websocket should always be open to whatever ELB_SSL_PORT is 
	
	//get the current state
	this.describeLoadBalancer(function (lbStatus) {
		console.error(JSON.stringify(lbStatus, null, 2));
	}); 
}

AwsHandler.prototype.describeLoadBalancer = function () {
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

AwsHandler.prototype.addListener = function (listenerObj) {
	var params = {
		Listeners: [
			listenerObj
		],
		LoadBalancerName: process.env.ELB_MANTICORE_NAME
	};
	elb.createLoadBalancerListeners(params, function (err, data) {
	});
}

AwsHandler.prototype.removeListener = function (lbPort) {
	var params = {
		LoadBalancerPorts: [lbPort],
		LoadBalancerName: process.env.ELB_MANTICORE_NAME
	};
	elb.deleteLoadBalancerListeners(params, function (err, data) {
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
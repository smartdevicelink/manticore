var AWS = require('aws-sdk');
var ec2 = new AWS.EC2();
var elb = new AWS.ELB();

//further requirements: Will use the IAM role associated with the machine Manticore runs in
//in order to deal with credentials for using Amazon's API. Make sure the instances is
//launched with a IAM role that is allowed to configure EC2 instance data such as 
//ELBs and security groups
//see http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RegionsAndAvailabilityZones.html
//for a list of regions to choose from
module.exports = function (region) {
    return new AwsHandler(region);
};

//a module that connects to AWS in order to change information such as the ELB
function AwsHandler (region) {
	if (region) { //only do things if region exists
		AWS.config.update({region: region});
	}
	this.test();
}

AwsHandler.prototype.test = function () {
	var params = {
		LoadBalancerNames: [process.env.ELB_MANTICORE_NAME],
	}
	elb.describeLoadBalancers({}, function (err, data) {
		console.error(err);
		console.error(data);
	});
}
/*
		var params = {
			GroupId: "",
		}
		console.log(ec2.modifyInstanceAttribute);
		ec2.describeSecurityGroups({}, function (err, data) {
			console.log(data.SecurityGroups[16].IpPermissions);
			console.log(data.SecurityGroups[16].IpPermissionsEgress);
		});
		//make a security group because why not
		var params = {
			Description: "Im computer generated!",
			GroupName: "Please delete me"
		};
		ec2.createSecurityGroup(params, function (err, data) {
			console.log(err);
			console.log(data);
		});
		*/
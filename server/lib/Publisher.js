//a module meant to store and publish data in a controllable fashion
var AWS = require('aws-sdk');
var cloudWatch = new AWS.CloudWatch();

module.exports = function (config) {
	//demonstrates all the properties and methods available
	var returnObj = {

	};
	
	if (config.cloudWatch) {
		cloudWatchInit();
	}

	return returnObj;
}

function cloudWatchInit () {
	cloudWatch.describeAlarms({}, function (err, data) {
		console.error(JSON.stringify(data, null, 4));
	});
}
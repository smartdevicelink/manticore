//module meant for logging to stdout and stderr to the user of immediate information
var winston = require('winston');
var config = require('./config');
var AWS = require('aws-sdk');
AWS.config.update({region: config.aws.awsRegion});
var cloudwatchlogs = new AWS.CloudWatchLogs();

let logLevel = "debug";
if (config.logLevel === "ERROR") {
	logLevel = "error";
} else if (config.logLevel === "INFO") {
	logLevel = "info";
}

const logger = new winston.Logger({
	transports: [
		new winston.transports.Console({
			colorize: true,
			timestamp: true,
			level: logLevel
		}),
		new winston.transports.File({
			level: logLevel,
			name: 'manticore',
			filename: 'manticore.log'
		})
	],
	exitOnError: false
});

var sequenceToken;
var logMessages = [];
var sendToLogs = setInterval(sendToCloudWatchLogs, 10000);

function sendToCloudWatchLogs() {
	var params = {
		logEvents: JSON.parse(JSON.stringify(logMessages)),
		logGroupName: config.logGroupName,
		logStreamName: streamName,
		sequenceToken: sequenceToken
	};
	logMessages = [];
	cloudwatchlogs.putLogEvents(params, function(err, data) {
		if (data) {
			sequenceToken = data.nextSequenceToken;
		}
	});
}

module.exports = {
	debug: function(msg) {
		logger.debug(msg);
		if (config.enableCloudWatchLogs) {
			logMessages.push({ message: msg, timestamp: Date.now() });
		}
	},
	error: function(msg) {
		logger.error(msg);
		if (config.enableCloudWatchLogs) {
			logMessages.push({ message: msg, timestamp: Date.now() });
		}
	},
	info: function(msg) {
		logger.info(msg);
		if (config.enableCloudWatchLogs) {
			logMessages.push({ message: msg, timestamp: Date.now() });
		}
	}
}

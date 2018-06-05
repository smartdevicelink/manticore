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

function sendToCloudWatchLogs(msg, streamName) {
	var params = {
		logEvents: [
			{
				message: msg,
				timestamp: Date.now()
			}
		],
		logGroupName: config.logGroupName,
		logStreamName: streamName
	};
	cloudwatchlogs.putLogEvents(params, function(err, data) {});
}

module.exports = {
	debug: function(msg) {
		logger.debug(msg);
		if (config.enableCloudWatchLogs) {
			sendToCloudWatchLogs(msg, 'debug');
		}
	},
	error: function(msg) {
		logger.error(msg);
		if (config.enableCloudWatchLogs) {
			sendToCloudWatchLogs(msg, 'error');
		}
	},
	info: function(msg) {
		logger.info(msg);
		if (config.enableCloudWatchLogs) {
			sendToCloudWatchLogs(msg, 'info');
		}
	}
}

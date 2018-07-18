//module meant for logging to stdout and stderr to the user of immediate information
var winston = require('winston');
var config = require('./config');
var cwl = require('./cwl');

let cloudWatchLogsEnabled = config.aws && config.aws.cloudWatchLogs;

if (cloudWatchLogsEnabled) {
	cwl.setupCloudWatchLogs(
		config.aws.awsRegion,
		config.aws.cloudWatchLogs.logGroupName,
		config.aws.cloudWatchLogs.logStreamName,
		function(err) {
			if (err) {
				cloudWatchLogsEnabled = false;
				return;
			}
			cwl.startLogging(10000);
		}
	);
}

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

module.exports = {
	debug: function(msg) {
		logger.debug(msg);
		if (cloudWatchLogsEnabled) {
			cwl.queueLog(msg);
		}
	},
	error: function(msg) {
		logger.error(msg);
		if (cloudWatchLogsEnabled) {
			cwl.queueLog(msg);
		}
	},
	info: function(msg) {
		logger.info(msg);
		if (cloudWatchLogsEnabled) {
			cwl.queueLog(msg);
		}
	}
}
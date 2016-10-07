var winston = require('winston');

var env = process.env.NODE_LOGS;
var logLevel = "info"; //default. logs info, error
if (env === "PRODUCTION") {
	logLevel = "error"; //logs errors
}
else if (env === "DEBUG") {
	logLevel = "debug"; //logs debug, info, error
}

var logger = new winston.Logger({
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

module.exports = logger;
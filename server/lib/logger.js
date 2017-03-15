var winston = require('winston');

module.exports = function (logEnv) {
	var env = logEnv;
	var logLevel = "debug"; //default
	if (env === "PRODUCTION") {
		logLevel = "error"; //logs errors
	}
	else if (env === "INFO") {
		logLevel = "info"; //logs info, error
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
	return logger;
}
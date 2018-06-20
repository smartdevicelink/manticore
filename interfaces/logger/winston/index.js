const winston = require('winston');
const config = require('./config.js');

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp(), 
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
        new winston.transports.Console({
            level: config.level
        }),
        new winston.transports.File({ //only write errors to file
            level: 'error',
            name: 'manticore_logs',
            filename: 'manticore_logs.log'
        })
    ],
    exitOnError: false
});

module.exports = {
    debug: logger.debug,
    info: logger.info,
    error: logger.error
}

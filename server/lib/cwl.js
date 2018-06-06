var async = require('async');
var AWS  = require('aws-sdk');
var cloudwatchlogs;

var logGroup;
var logStream;
var sequenceToken;
var messages = [];
var logTimer;

/** @module lib/cwl */

/**
* Sets up sending log events to CloudWatch Logs
* @function
* @param {string} region - The AWS region to be used (ex. us-east-1)
* @param {string} groupName - Name of the CloudWatch log group
* @param {string} streamName - Name of the CloudWatch log stream
* @param {function} cb - callback function
*/
function setupCloudWatchLogs(region, groupName, streamName, cb) {
    async.waterfall([
        function(callback) {
            setRegion(region);
            callback(null);
        },
        function(callback) {
            setLogGroup(groupName, function(err) {
                callback(err);
            });
        },
        function(callback) {
            setLogStream(streamName, function(err) {
                callback(err);
            });
        }
    ], function(err, response) {
        cb(err);
    });
}

/**
* Sets the region and creates the CloudWatchLogs
* @function
* @param {string} region - The AWS region to be used (ex. us-east-1)
*/
function setRegion(region) {
    AWS.config.update({ region: region });
    cloudwatchlogs = new AWS.CloudWatchLogs();
}

/**
* Sets the log group for the CloudWatch Logs
* @function
* @param {string} group - Name of the CloudWatch log group
* @param {function} callback - callback function
*/
function setLogGroup(group, callback) {
    cloudwatchlogs.describeLogGroups({logGroupNamePrefix: group}, function(err, data) {
        if (data) {
            for (let i = 0; i < data.logGroups.length; i++) {
                if (data.logGroups[i].logGroupName === group) {
                    logGroup = group;
                    return callback(null);
                }
            }
        }
        return callback(err);
    });
}

/**
* Sets the log stream for the CloudWatch Logs
* @function
* @param {string} stream - Name of the CloudWatch log stream
* @param {function} callback - callback function
*/
function setLogStream(stream, callback) {
    cloudwatchlogs.describeLogStreams({
        logGroupName: logGroup,
        logStreamNamePrefix: stream
    }, function(err, data) {
        if (data) {
            for (let i = 0; i < data.logStreams.length; i++) {
                if (data.logStreams[i].logStreamName === stream) {
                    logStream = stream;
                    sequenceToken = data.logStreams[i].uploadSequenceToken;
                    return callback(null);
                }
            }
        }
        return callback(err);
    });
}

/**
* Sends all queued up logs to CloudWatch
* @function
*/
function sendLogsToCloudWatch() {
    if (!messages.length) {
        return;
    }

    var params = {
        logEvents: JSON.parse(JSON.stringify(messages)),
        logGroupName: logGroup,
        logStreamName: logStream,
        sequenceToken: sequenceToken
    };
    messages = [];
    cloudwatchlogs.putLogEvents(params, function(err, data) {
        if (data) {
            sequenceToken = data.nextSequenceToken;
        }
    });
}

/**
* Adds a new log to the queue
* @function
* @param {string} log - log to be added to the queue
*/
function queueLog(log) {
    if (typeof(log) === "object" || Array.isArray(log)) {
        log = JSON.stringify(log);
    }
    messages.push({ message: String(log), timestamp: Date.now() });
}

/**
* Starts an interval for sending queued log messages to CloudWatch
* @function
* @param {string} time - time in milliseconds to wait between sending logs to CloudWatch
*/
function startLogging(time) {
    if (cloudwatchlogs && logGroup && logStream) {
        logTimer = setInterval(sendLogsToCloudWatch, time);
        return true;
    }
    return false;
}

/**
* Stops logging events to CloudWatch
* @function
*/
function stopLogging() {
    if (logTimer) {
        clearInterval(logTimer);
        logTimer = null;
        return true;
    }
    return false;
}

module.exports = {
    setupCloudWatchLogs: setupCloudWatchLogs,
    queueLog: queueLog,
    startLogging: startLogging,
    stopLogging: stopLogging
}

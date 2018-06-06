var async = require('async');
var AWS  = require('aws-sdk');
var cloudwatchlogs;

var logGroup;
var logStream;
var sequenceToken;
var messages = [];
var logTimer;

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

function setRegion(region) {
    AWS.config.update({ region: region });
    cloudwatchlogs = new AWS.CloudWatchLogs();
}

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

function queueLog(log) {
    if (typeof(log) === "object" || Array.isArray(log)) {
        log = JSON.stringify(log);
    }
    messages.push({ message: String(log), timestamp: Date.now() });
}

function startLogging(time) {
    if (cloudwatchlogs && logGroup && logStream) {
        logTimer = setInterval(sendLogsToCloudWatch, time);
        return true;
    }
    return false;
}

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

var async = require('async');

var context;
var publishTimer;

function publishToDashboard() {
    console.log('Publishing to CloudWatch');
    async.waterfall([
        function(callback) {
            context.consuler.getKeyAll(context.keys.request, function(result) {
                callback(null, result);
            });
        },
        function(requests, callback) {
            context.consuler.getKeyAll(context.keys.allocation, function(result) {
                callback(null, requests, result);
            });
        },
        function(requests, allocations, callback) {
            console.log('Requests: ' + requests.length);
            console.log('Allocations: ' + allocations.length);
            var timestamp = new Date();
            context.AwsHandler.publishMultiple([
                {
                    MetricName: context.strings.requestCount,
                    Dimensions: [],
                    Timestamp: timestamp,
                    Unit: "Count",
                    Value: requests.length - 1
                },
                {
                    MetricName: context.strings.allocationCount,
                    Dimensions: [],
                    Timestamp: timestamp,
                    Unit: "Count",
                    Value: allocations.length - 1
                }
            ]);
            callback(null);
        }
    ], function (err, results) {});
}

module.exports = function (c) {
    console.log('Inside CloudWatchDashboard');
    context = c;
    if (context.config.aws && context.config.aws.cloudWatch) {
        console.log('Starting timer');
        publishTimer = setInterval(publishToDashboard, 50000);
    }
}

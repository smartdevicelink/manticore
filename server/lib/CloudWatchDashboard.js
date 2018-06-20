var async = require('async');

var context;
var publishTimer;

function publishToDashboard() {
    async.waterfall([
        function(callback) {
            context.consuler.getKeyValue(context.keys.request, function(result) {
                callback(null, result);
            });
        },
        function(requests, callback) {
            context.consuler.getKeyValue(context.keys.allocation, function(result) {
                callback(null, requests, result);
            });
        },
        function(requests, allocations, callback) {
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
        }
    ], function (err, results) {});
}

module.exports = function (c) {
    context = c;
    if (context.config.aws && context.config.aws.cloudwatch) {
        publishTimer = setInterval(publishToDashboard, 50000);
    }
}

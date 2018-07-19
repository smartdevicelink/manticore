var async = require('async');

var gb;
var context;
var publishTimer;
var DATASET;

function publishToDashboard() {
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
            var timestamp = new Date();

            DATASET.post(
                [
                    {
                        "allocation-count": allocations.length - 1,
                        "request-count": requests.length - 1,
                        time: timestamp.toISOString()
                    }
                ],
                {},
                function(err) {
                    if (err) {
                        console.log('Could not push data to Geckboard');
                    }
                    callback(err);
                }
            );
        }
    ], function (err, results) {
        console.log(err);
    });
}

module.exports = function (c) {
    console.log('Starting up Geckoboard');
    console.log(context.config.geckoboard);

    context = c;
    if (context.config.geckoboard) {
        gb = require('geckoboard')(context.config.geckoboard.apiKey);
        gb.ping(function(err) {
            console.log('Authenticating Geckoboard credentials');

            if (err) {
                console.log('Geckoboard authentication failed');
                return;
            }

            console.log('Geckoboard authentication successful');
            gb.datasets.findOrCreate(
                {
                    id: 'manticore-allocations',
                    fields: {
                        "allocation-count": {
                            type: 'number',
                            name: 'Allocation Count',
                            optional: false
                        },
                        "request-count": {
                            type: 'number',
                            name: 'Request Count',
                            optional: false
                        },
                        "time": {
                            type: 'datetime',
                            name: 'Time',
                            optional: false
                        }
                    },
                    unique_by: ['time']
                },
                function(err, dataset) {
                    if (err) {
                        console.log('Could not find or create Geckoboard dataset');
                        console.log(err);
                        return;
                    }

                    DATASET = dataset;
                    console.log('Starting to publish data');
                    publishTimer = setInterval(publishToDashboard, 60000);
                }
            )
        });
    }
}

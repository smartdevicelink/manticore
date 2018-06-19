const config = require('./config.js');
const promisify = require('util').promisify;
const consul = require('consul')({host: config.clientAgentIp});

async function watch (service, cb) {
	const watch = consul.watch({
		method: consul.health.service,
		options: {service: service}
	});
    watch.on('change', function (data, res) {
        cb(data);
    });
    watch.on('error', function (err) { //couldn't connect to the agent
        if (err.code === "ECONNREFUSED") {
            throw Error("Could not connect to Consul agent at IP " + config.clientAgentIp);
        }
        else {
            throw Error(err);
        }
    });
}

module.exports = {
	watch: watch
}
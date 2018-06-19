const config = require('./config.js');
const promisify = require('util').promisify;
const consul = require('consul')({host: config.clientAgentIp});

async function watch (id, cb) {
    const watch = consul.watch({
        method: consul.kv.get,
        options: {key: id},
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

async function get (key) {
    return promisify(consul.kv.get.bind(consul.kv))(key);
}

async function set (opts) {
    opts.value = ""+opts.value; //coerce the value to string
    return promisify(consul.kv.set.bind(consul.kv))(opts);
}

async function cas (key, transformFunc) {
    const result = await get(key);
    const casIndex = result ? result.ModifyIndex : 0;
    const newValue = await transformFunc(result ? result.Value : undefined);
    return await set({
        key: key, 
        value: newValue,
        cas: casIndex
    })
}

module.exports = {
    watch: watch,
    get: get,
    set: set,
    cas: cas
}
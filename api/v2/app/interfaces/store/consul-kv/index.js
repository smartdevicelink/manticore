// Copyright (c) 2018, Livio, Inc.
const config = require('./config.js');
const promisify = require('util').promisify;
const consul = require('consul')({host: config.clientAgentIp});

async function watch (key, cb) {
    const watch = consul.watch({
        method: consul.kv.get,
        options: {key: key},
    });
    watch.on('change', function (data) {
        //an attempt to watch a key that doesn't exist will cause the watch to be invoked rapidly
        //only callback if data is defined
        if (data) {
            cb(createUpdateHandler(key, data));
        }
    });
    watch.on('error', function (err) { //couldn't connect to the agent
        if (err.code === "ECONNREFUSED") {
            throw Error("Could not connect to Consul agent at IP " + config.clientAgentIp);
        }
        else {
            throw Error(err);
        }
    });
    //expose a function to stop the watch
    return {
        end: watch.end.bind(watch) 
    }
}

async function get (key) {
    return promisify(consul.kv.get.bind(consul.kv))(key);
}

async function set (opts) {
    opts.value = ""+opts.value; //coerce the value to string
    return promisify(consul.kv.set.bind(consul.kv))(opts);
}

async function cas (key) {
    const result = await get(key);
    return createUpdateHandler(key, result);
}

function createUpdateHandler (key, data) {
    //if no result, casIndex should be 0 to signify a new entry where the key is
    const casIndex = data ? data.ModifyIndex : 0;
    return {
        value: data ? data.Value : undefined,
        //provide a function to set the new value in a concurrency-friendly manner
        set: async newValue => {
            //if the index has changed in the remote, this set will fail. this means
            //that another server submitted the same change first
            return await set({
                key: key, 
                value: newValue,
                cas: casIndex
            });
        }
    }
}

module.exports = {
    watch: watch,
    cas: cas,
    set: set
}
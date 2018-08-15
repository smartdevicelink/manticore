// Copyright (c) 2018, Livio, Inc.
const fs = require('fs');
const compose = require("koa-compose");
const logger = require('./config.js').logger;
const promisify = require('util').promisify;

//all the types of hooks that modules under the listeners folder can subscribe to
const listenerOptions = [
    { name: "ws-connect", isMainHook: false},
    { name: "ws-message", isMainHook: false},
    { name: "ws-disconnect", isMainHook: false},
    { name: "startup", isMainHook: false},
    { name: "pre-request", isMainHook: false},
    { name: "request", isMainHook: true},
    { name: "post-request", isMainHook: false},
    { name: "pre-waiting-find", isMainHook: false},
    { name: "waiting-find", isMainHook: true},
    { name: "post-waiting-find", isMainHook: false},
    { name: "pre-waiting-job-advance", isMainHook: false},
    { name: "waiting-job-advance", isMainHook: true},
    { name: "post-waiting-job-advance", isMainHook: false},
];

module.exports = {
    init: async () => {
        //load up all listeners
        const folders = await promisify(fs.readdir)(`${__dirname}/listeners`);

        let listenerHash = {}; // a map of arrays of function hooks

        folders.forEach(folder => {
            const listeners = require(`./listeners/${folder}`);
            for (let name in listeners) {
                if (!listenerHash[name]) {
                    listenerHash[name] = []; //default to empty
                }
                listenerHash[name].push(listeners[name]);
            }
        });

        let listenerStore = {};
        //for every listener option available, compose all hooks of that option type into a middleware stack
        listenerOptions.forEach(opt => {
            //if its a main hook, provide a warning about multiple listeners attached
            if (!listenerHash[opt.name]) {
                listenerHash[opt.name] = [];
            }
            if (opt.isMainHook && listenerHash[opt.name].length > 1) {
                logger.warn(`"${opt.name}" is a main hook that has more than one listener attached. This may cause state changing issues!`);
            }
            //combine all the hooks
            listenerStore[opt.name] = compose(listenerHash[opt.name]);
        });
        return listenerStore;
    }
}

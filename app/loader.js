const fs = require('fs');
const compose = require("koa-compose");
const logger = require('./config.js').logger;
const promisify = require('util').promisify;

//all the types of hooks that modules under the listeners folder can subscribe to
//TODO: dont even specify this?? just let anything be attached?? how will manticore call them, then??
//for the multi-stage stuff it will have to be all under one event, but passing in different contexts
//describing what stage the job submission is on. yes.
//only use this options array for checking for main hook violations. all hook types should be valid
//then this would be a hash and you would iterate over listenerHash for composing
const listenerOptions = [
    { name: "pre-request", isMainHook: false},
    { name: "request", isMainHook: true},
    { name: "post-request", isMainHook: false},
    { name: "pre-waiting-find", isMainHook: false},
    { name: "waiting-find", isMainHook: true},
    { name: "post-waiting-find", isMainHook: false},
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

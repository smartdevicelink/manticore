// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const {store, job, logger} = config;

//module that handles logging of different state changes
module.exports = {
    "pre-request": async (ctx, next) => {
        logger.debug("New request state: " + JSON.stringify(ctx.requestState));
        next();
    },
    "pre-waiting-find": async (ctx, next) => {
        //cut off the 'request' and 'id' property of each user for the sake of brevity
        //modifying the context in a pre/post hook is forbidden. clone it
        const clonedState = JSON.parse(JSON.stringify(ctx.waitingState));
        for (let id in clonedState) {
            delete clonedState[id].services;
            delete clonedState[id].request;
            delete clonedState[id].id;
        }
        logger.debug("Current waiting list: " + JSON.stringify(clonedState));
        next();
    },
    "post-waiting-find": async (ctx, next) => {
        //cut off the 'request' property of each user for the sake of brevity
        //modifying the context in a pre/post hook is forbidden. clone it
        if (!ctx.currentRequest) {
            logger.debug("No user selected in waiting");
            return next();
        }
        const request = JSON.parse(JSON.stringify(ctx.currentRequest));
        delete request.services;
        delete request.request;
        logger.debug("Selected user in waiting: " + JSON.stringify(request));
        next();
    },
    "post-waiting-job-advance": async (ctx, next) => {
        //cut off the 'request' property of each user for the sake of brevity
        //modifying the context in a pre/post hook is forbidden. clone it
        if (!ctx.currentRequest) return next();
        
        if (!ctx.removeUser) {
            let request = JSON.parse(JSON.stringify(ctx.currentRequest.id));
            delete request.request;
            logger.debug("Updated user in waiting: " + JSON.stringify(request));
        }
        else {
            logger.warn(`User ${ctx.currentRequest.id} has been booted off the store!`);
        }
        next();
    },
    "ws-connect": async (ctx, next) => {
        logger.debug(`New connection from request ${ctx.id}`);
        next();
    },
    "ws-disconnect": async (ctx, next) => {
        logger.debug(`Connection dropped from request ${ctx.id}`);
        next();
    }
}
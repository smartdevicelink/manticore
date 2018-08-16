// Copyright (c) 2018, Livio, Inc.
const parent = require('../../index.js');
const config = require('../../config.js');
const {store, job, logger, websocket, usageDuration, warningDuration} = config;
const utils = require('../../utils');
const AwsHandler = require('../aws-elb/AwsHandler.js')();

//module that will force the request's removal if the client does not send an activity update often enough

let activityTimers = {}; //a hash of timers, where the key is the id

module.exports = {
    //finds claimed requests and attaches timers to those requests
    //therefore, timers only start when a job is fulfilled
    "post-waiting-job-advance": async (ctx, next) => {
        const claimedRequests = [];

        for (let id in ctx.waitingState) {
            if (ctx.waitingState[id].state === "claimed") {
                claimedRequests.push(ctx.waitingState[id]);
            }
        }

        //parse through all claimed requests and setup activity timers
        claimedRequests.forEach(request => {
            const id = request.id;
            addTimer(id);
        });

        next();
    },
    //listen to activity messages from a client
    "ws-message": async (ctx, next) => {
        const {id, message, websocket} = ctx;
        if (!config.modes.inactivityTimer) return await next(); //mode not enabled
        //ignore activity messages if the environment says to
        if (!config.resetTimerAllowed) return await next();
        //look for messages of this format: { type: "activity" }
        //if such a message is received, reset the client's timer
        const msgJson = await utils.parseJson(message);
        if (!msgJson.type || !msgJson.type === "activity") return await next(); //invalid message
        restartTimer(id);
        next();
    },

    "startup": async (ctx, next) => {
        if (!config.modes.inactivityTimer) return await next();

        var timeoutDuration = parseInt(config.usageDuration) + parseInt(config.warningDuration)
        if (config.modes.elb && timeoutDuration > 4000) {
            logger.warn('Idle timeout capped at 4000 seconds since ELB mode is enabled');
            timeoutDuration = 4000;
        }

        await store.set({
            key: 'timeoutDuration',
            value: timeoutDuration
        });

        if (!config.modes.elb) return await next();
        await AwsHandler.setElbTimeout(timeoutDuration).catch(err => logger.error(err));

        next();
    }
}

//activity timer-related functions

function addTimer (id) {
    //do not use the timers if manticore isn't configured to use them
    if (!config.modes.inactivityTimer) return;

    if (!activityTimers[id]) {
        activityTimers[id] = setTimeout(afterUsageDuration.bind(null, id), usageDuration * 1000);
    }
}

function restartTimer (id) {
    removeTimer(id);
    addTimer(id);
}

function removeTimer (id) {
    if (activityTimers[id]) {
        clearTimeout(activityTimers[id]);
        delete activityTimers[id];
    }
}

async function afterUsageDuration (id) {
    //usage duration reached! warn the client of removal of their job
    const warnObj = {
        type: "activity",
        data: {
            remainingTime: warningDuration
        }
    };
    await websocket.send(id, JSON.stringify(warnObj));
    //set up another timer after the warning
    activityTimers[id] = setTimeout(afterWarningDuration.bind(null, id), warningDuration * 1000);
}

async function afterWarningDuration (id) {
    //warning duration reached! remove the user from the request list
    await parent.deleteRequest(id);
    removeTimer(id);
}

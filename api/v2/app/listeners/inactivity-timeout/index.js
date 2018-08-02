const parent = require('../../index.js');
const config = require('../../config.js');
const {store, job, logger, websocket, usageDuration, warningDuration} = config;
const utils = require('../../utils');

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
        //look for messages of this format: { type: "activity" }
        //if such a message is received, reset the client's timer
        const msgJson = await utils.parseJson(message);
        if (!msgJson.type || !msgJson.type === "activity") return; //invalid message
        restartTimer(id);
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
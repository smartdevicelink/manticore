// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const {store, job, logger, websocket} = config;

//module that handles transmitting information to clients connected over websockets

let cachedInfo = {};

module.exports = {
    //clears cached info of removed users
    "removed-request": async (ctx, next) => {
        clearInfo(ctx.id);
        next();
    },
    //for transmitting position information ASAP to non-claimed users
    "post-request": async (ctx, next) => {
        //get all the non-claimed requests
        const nonClaimedRequests = [];

        for (let id in ctx.waitingState) {
            if (ctx.waitingState[id].state !== "claimed") {
                nonClaimedRequests.push(ctx.waitingState[id]);
            }
        }

        await manageNonClaimedRequests(nonClaimedRequests);
    },
    //for transmitting services and position information to users
    "post-waiting-job-advance": async (ctx, next) => {
        //split up requests into two categories
        const claimedRequests = [];
        const nonClaimedRequests = [];

        for (let id in ctx.waitingState) {
            if (ctx.waitingState[id].state === "claimed") {
                claimedRequests.push(ctx.waitingState[id]);
            }
            else {
                nonClaimedRequests.push(ctx.waitingState[id]);
            }
        }

        //clear out the cache, since the cache is being completely remade
        clearCache();

        await manageNonClaimedRequests(nonClaimedRequests);

        await manageClaimedRequests(claimedRequests);

        next();
    },
    "ws-connect": async (ctx, next) => {
        //if instance information already exists for this user, then send it
        const positionInfo = getInfo(ctx.id, "position");
        const serviceInfo = getInfo(ctx.id, "services");
        if (positionInfo) {
            await websocket.send(ctx.id, JSON.stringify(positionInfo));
        }
        if (serviceInfo) {
            await websocket.send(ctx.id, JSON.stringify(job.formatAddresses(ctx.id, serviceInfo.data)));
        }
        next();
    }
}

async function manageNonClaimedRequests (requests) {
    //sort non-claimed requests by lowest queue number
    requests.sort( (a, b) => {
        return a.queue - b.queue;
    });

    //parse through all non-claimed requests and send the following:
    //the position in the queue they are in
    //whether they need to wait in the queue (is the user in a waiting state?)
    requests.forEach(async (request, index) => {
        const id = request.id;
        const positionInfo = {
            type: "position",
            data: {
                position: index,
                wait: request.state === "waiting"
            }
        };
        storeInfo(id, "position", positionInfo); //cache position info
        await websocket.send(id, JSON.stringify(positionInfo));
    });
}

async function manageClaimedRequests (requests) {
    //parse through all claimed requests and send the address information to the clients
    requests.forEach(async request => {
        const id = request.id;
        const serviceInfo = {
            type: "services",
            data: request.services
        };
        storeInfo(id, "services", serviceInfo); //cache service info
        await websocket.send(id, JSON.stringify(job.formatAddresses(id, serviceInfo.data)));
    });
}

//cache-related functions

function storeInfo (id, property, value) {
    if (!cachedInfo[id]) {
        cachedInfo[id] = {};
    }
    cachedInfo[id][property] = value;
}

function getInfo (id, property) {
    if (!cachedInfo[id]) return null;
    return cachedInfo[id][property];
}

function clearCache () {
    cachedInfo = {};
}

function clearInfo (id) {
    delete cachedInfo[id];
}
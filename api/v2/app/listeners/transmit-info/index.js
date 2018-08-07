const config = require('../../config.js');
const {store, job, logger, websocket} = config;

//module that handles transmitting information to clients connected over websockets

let cachedInfo = {};

module.exports = {
    //finds users in the waiting list not in the request list and clears their cached info
    "pre-request": async (ctx, next) => {
        const {requestState, waitingState} = ctx;
        for (let id in waitingState) {
            if (!requestState[id]) { //user in waiting is not in the requests
                clearInfo(id);
            }
        }
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
            await websocket.send(ctx.id, JSON.stringify(formatAddresses(serviceInfo.data)));
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
        await websocket.send(id, JSON.stringify(formatAddresses(serviceInfo.data)));
    });
}

function formatAddresses(services){
    var jsonObj = {};
    let addressObj = {};
    for(var service in services){
        for(var addressName in services[service]){
            addressObj = services[service][addressName];
            if(config.modes.haproxy){
                if(addressObj.isHttp){
                    jsonObj[addressName] = addressObj.external + '.' + config.haproxyDomain;
                } else {
                    jsonObj[addressName] = config.haproxyDomain + ':' + addressObj.external;
                }
            } else {
                jsonObj[addressName] = addressObj.internal;
            }
        }
    }
    return jsonObj;
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
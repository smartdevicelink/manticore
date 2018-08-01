const config = require('./config.js');
const {store, job, logger, websocket} = config;
const check = require('check-types');
const loader = require('./loader.js');

const REQUESTS_KEY = "manticore/requests";
const WAITING_KEY = "manticore/waiting";

let listeners = {}; //to be loaded later

module.exports = {
    getJobInfo: async () => {
        return await job.jobOptions();
    },
    validateJob: async body => {
        return await job.validate(body);
    },
    //store a request and return a websocket address for the client to listen on
    storeRequest: async (id, body) => { 
        const setter = await store.cas(REQUESTS_KEY)
        const requestState = await parseJson(setter.value);
        if (requestState[id]) return await websocket.getPasscode(id); //request already exists. do not update the store
        requestState[id] = body; //store the result of the job validation
        await setter.set(JSON.stringify(requestState)) //submit the new entry to the store
        return await websocket.getPasscode(id); //passcode for the user to use when connecting via websockets
    },
    deleteRequest: async id => {
        const setter = await store.cas(REQUESTS_KEY)
        const requestState = await parseJson(setter.value);
        if (!requestState[id]) return; //the id doesn't exist in the first place. prevent redundant update
        delete requestState[id]; //bye
        await setter.set(JSON.stringify(requestState)) //submit the new entry to the store 
    },
    onConnection: async (id, websocket) => { //client connected over websockets
        const ctx = {
            id: id,
            websocket: websocket
        }
        await listeners['ws-connect'](ctx);
    },
    onMessage: async (id, message, websocket) => { //client sent a message
        const ctx = {
            id: id,
            message: message,
            websocket: websocket
        }
        await listeners['ws-message'](ctx);
    },
    onDisconnection: async (id, websocket) => { //client disconnected over websockets
        const ctx = {
            id: id,
            websocket: websocket
        }
        await listeners['ws-disconnect'](ctx);
    }
}

//log out all configurable modes of manticore and whether they are enabled
for (let name in config.modes) {
    const enabledString = config.modes[name] ? "enabled" : "disabled";
    logger.info(`Mode ${name} is ${enabledString}`);
}

//initialize watches to the KV store
startWatches().catch(err => logger.error(err));

async function startWatches () {
    //load up the listeners to the listener store
    listeners = await loader.init();
    logger.debug("listeners loaded");
    //invoke startup listeners. no updates with the store will happen until this phase completes
    await listeners['startup']({});
    //watch for KV store changes
    const w1 = store.watch(REQUESTS_KEY, requestTrigger);
    const w2 = store.watch(WAITING_KEY, waitingTrigger);
}

//request store update
async function requestTrigger (requestSetter) {
    const requestState = await parseJson(requestSetter.value);
    //retrieve the waiting list state
    const waitingSetter = await store.cas(WAITING_KEY);
    const waitingState = await parseJson(waitingSetter.value);

    const ctx = {
        requestState: requestState,
        waitingState: waitingState
    };
    await listeners['pre-request'](ctx);
    await listeners['request'](ctx);
    await listeners['post-request'](ctx);

    await waitingSetter.set(JSON.stringify(ctx.waitingState)); //submit the new entry to the store
}

//waiting store update
async function waitingTrigger (waitingSetter) {
    let waitingState = await parseJson(waitingSetter.value);
    const ctx = {
        currentRequest: undefined, //expected to be a sub-object of the waiting state, or undefined, or null
        waitingState: waitingState,
        updateStore: false, //whether the remote state should be updated
        removeUser: false //whether the request should be removed completely
    };

    await listeners['pre-waiting-find'](ctx);
    await listeners['waiting-find'](ctx);
    await listeners['post-waiting-find'](ctx);
    //if currentRequest doesnt exist then there are no users to handle
    if (ctx.currentRequest === null || ctx.currentRequest === undefined) return;

    //determine whether a request's job status is at the point where further updates can happen.
    await listeners['pre-waiting-job-advance'](ctx);
    await listeners['waiting-job-advance'](ctx);
    await listeners['post-waiting-job-advance'](ctx);

    //removeUser takes priority over updating the store
    if (ctx.removeUser) {
        //the request has to be removed in the requests, and not in the waiting list
        const requestSetter = await store.cas(REQUESTS_KEY);
        const requestState = await parseJson(requestSetter.value);
        delete requestState[ctx.currentRequest.id];
        await requestSetter.set(JSON.stringify(requestState)); //submit the changes
        return;
    }

    if (!ctx.updateStore) return; //prevent an update to the store from happening

    //at this point this server can post an update to the store
    await waitingSetter.set(JSON.stringify(ctx.waitingState)); //submit the new entry to the store
}

//helper function for converting strings to JSON
async function parseJson (string) {
    try {
        return JSON.parse(string);
    } catch (err) { //invalid JSON here. initialize to empty object
        if (string !== undefined) {
            //unexpected JSON parsing error
            logger.error(new Error("Invalid JSON string: " + string).stack);
        }
        return {};
    }
}

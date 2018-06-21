const config = require('./config.js');
const {store, services, job, logger} = config;
const check = require('check-types');
const watcher = require('./watcher.js');

module.exports = {
    getJobInfo: async () => {
        return await job.get();
    },
    validateJob: async body => {
        return await job.validate(body);
    },
    storeRequest: async (id, body) => {
        const setter = await store.cas('manticore/requests')
        const requestState = await parseJson(setter.value);
        if (requestState[id]) return; //request already exists. do not update the store
        requestState[id] = body; //store the result of the job validation
        setter.set(JSON.stringify(requestState)) //submit the new entry to the store
    }
}

//initialize watches to the KV store
startWatches().catch(err => logger.error(err)); //all errors in the watches will stop propagating here

async function startWatches () {
    const w1 = store.watch('manticore/requests', requestTrigger);
    const w2 = store.watch('manticore/waiting', waitingTrigger);
    watcher.add("request", w1);
    watcher.add("waiting", w2);
}

//request store update
async function requestTrigger (requestState) {
    requestState = await parseJson(requestState);
    //retrieve the waiting list state
    const setter = await store.cas('manticore/waiting');
    const waitingState = await parseJson(setter.value);
    //sync up the waiting state to have all and only the users in the request state
    const newWaitingState = {};
    let maxQueue = 0; //get the highest queue number in the waiting list
    for (let id in waitingState) {
        maxQueue = Math.max(maxQueue, waitingState[id].queue);
    }
    for (let id in requestState) {
        if (waitingState[id]) { //managed user is already in waiting
            newWaitingState[id] = waitingState[id];
        }
        else { //managed user is not in waiting
            newWaitingState[id] = {
                queue: ++maxQueue, //set the queue of this user one above the highest number
                state: "pending",
                request: requestState[id]
            }
        }
    }
    setter.set(JSON.stringify(newWaitingState)) //submit the new entry to the store
}

//waiting store update
async function waitingTrigger (waitingState) {
    waitingState = await parseJson(waitingState);
    
}

//helper function for converting strings to JSON
async function parseJson (string) {
    try {
        return JSON.parse(string);
    } catch (err) { //no JSON here. initialize to empty object
        return {};
    }
}

/*
const consulWatch = await services.watch('consul', function (data) {
    console.log(data);
});
setTimeout(function () {
    console.log(consulWatch);
    consulWatch.end();
}, 2000)


services.watch('nomad', function (data) {
    console.log(data);
});
services.watch('nomad-client', function (data) {
    console.log(data);
});
*/

const config = require('./config.js');
const {store, services, job, logger} = config;
const check = require('check-types');
const watcher = require('./watcher.js');

const REQUESTS_KEY = "manticore/requests";
const WAITING_KEY = "manticore/waiting";

module.exports = {
    getJobInfo: async () => {
        return await job.jobOptions();
    },
    validateJob: async body => {
        return await job.validate(body);
    },
    storeRequest: async (id, body) => {
        const setter = await store.cas(REQUESTS_KEY)
        const requestState = await parseJson(setter.value);
        if (requestState[id]) return; //request already exists. do not update the store
        requestState[id] = body; //store the result of the job validation
        setter.set(JSON.stringify(requestState)) //submit the new entry to the store
    }
}

//initialize watches to the KV store
startWatches().catch(err => logger.error(err)); //all errors in the watches will stop propagating here

async function startWatches () {
    const w1 = store.watch(REQUESTS_KEY, requestTrigger);
    const w2 = store.watch(WAITING_KEY, waitingTrigger);
    watcher.add(REQUESTS_KEY, w1);
    watcher.add(WAITING_KEY, w2);
}

//TODO: handle deleting jobs somewhere

//request store update
async function requestTrigger (requestSetter) {
    const requestState = await parseJson(requestSetter.value);
    //retrieve the waiting list state
    const waitingSetter = await store.cas(WAITING_KEY);
    const waitingState = await parseJson(waitingSetter.value);
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
                id: id,
                queue: ++maxQueue, //set the queue of this user one above the highest number
                state: "waiting",
                request: requestState[id]
            };
        }
    }
    //logger.debug("Request update: " + JSON.stringify(newWaitingState, null, 4));
    await waitingSetter.set(JSON.stringify(newWaitingState)); //submit the new entry to the store
}

//waiting store update
async function waitingTrigger (waitingSetter) {
    //possible states: "waiting", "pending", "claimed"
    let waitingState = await parseJson(waitingSetter.value);
    //find the next request to handle
    const currentRequest = await findNextInQueue(waitingState);
    //if the request is not waiting, do not handle. another server is handling the request
    //if it is undefined, then there are no users to handle
    if (currentRequest === undefined || currentRequest.state !== "waiting") return;
    const ID = currentRequest.id;
    //attempt the set the request's state to pending
    waitingState[ID].state = "pending";
    //submit the new entry to the store 
    const updateSuccess = await waitingSetter.set(JSON.stringify(waitingState)); 
    if (!updateSuccess) return; //another server took charge in handling the request first
    //we need a new CAS since the previous CAS has been completed
    waitingSetter = await store.cas(WAITING_KEY);
    waitingState = await parseJson(waitingSetter.value);
    logger.debug("Handling request for: " + ID);
    //start up the job submission process
    //enforce a timeout for the job submission
    const jobPromise = job.submit(waitingState[ID].request);
    createJobTimeoutPromise(ID, jobPromise)
        .then(async success => {
            if (success) { //set the user's state to claimed
                logger.debug("Allocation successful for: " + ID);
                waitingState[ID].state = "claimed";
                await waitingSetter.set(JSON.stringify(waitingState)); //submit the changes
            }
            else { //set the user's state back to waiting
                logger.debug("Failed allocation. Set state back to waiting: " + ID);
                waitingState[ID].state = "waiting";
                await waitingSetter.set(JSON.stringify(waitingState)); //submit the changes
            }
        })
        .catch(async err => {
            //the job module's function crashed or timed out. remove the user from the request list 
            logger.error(new Error(err).stack);
            logger.error("Attempted allocation caused an error. Remove from requests: " + ID);
            const requestSetter = await store.cas(REQUESTS_KEY);
            const requestState = await parseJson(requestSetter.value);
            delete requestState[ID];
            await requestSetter.set(JSON.stringify(requestState)); //submit the changes
        });
}

async function createJobTimeoutPromise (id, promise) {
    const failTimer = new Promise(function (resolve, reject) {
        setTimeout(() => {
            reject("Job submission timed out for: " + id);
        }, config.jobTimeoutSeconds * 1000);
    });

    return Promise.race([
        failTimer,
        promise
    ]);
}

//find the next request that has not claimed a resource
async function findNextInQueue (waitingState) {
    let lowestIndex = Infinity;
    let lowestKey = null;
    for (let key in waitingState) {
        let value = waitingState[key].queue;
        if (waitingState[key].state !== "claimed" && value < lowestIndex) {
            lowestIndex = value;
            lowestKey = key;
        }
    }
    return waitingState[lowestKey];
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

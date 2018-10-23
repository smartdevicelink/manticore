// Copyright (c) 2018, Livio, Inc.
module.exports = {
    //logic for determining the request to pick:
    //if the waiting list is empty, return null
    //if the waiting list has all claimed, return null
    //if there are non-claimed, non-waiting requests, return the one whose queue is the lowest number
    //if the waiting list has all waiting or claimed, return the waiting request whose queue is the lowest number
    "waiting-find": async (ctx, next) => {
        const waitingState = ctx.waitingState;
        let lowestIndex = Infinity;
        let lowestKey = null;
        let lowestIsWaiting = true;
        for (let key in waitingState) {
            const value = waitingState[key].queue;
            const state = waitingState[key].state;
            if (state !== "claimed" && state !== "waiting") { //non-claimed, non-waiting request found
                if (lowestIsWaiting) { //non-claimed, non-waiting request trumps waiting request
                    lowestIndex = value; 
                    lowestKey = key;
                    lowestIsWaiting = false;
                }
                else if (value < lowestIndex) {
                    lowestIndex = value; 
                    lowestKey = key;
                }
            }
            //used as long as there are no non-waiting, non-claimed requests
            if (state === "waiting" && value < lowestIndex && lowestIsWaiting) {
                lowestIndex = value;
                lowestKey = key;
            }
        }
        ctx.currentRequest = waitingState[lowestKey];
        next();
    },
}

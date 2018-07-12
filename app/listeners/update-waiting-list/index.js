module.exports = {
    //uses the request data and waiting data to update the waiting list
    "request": async (ctx, next) => {
        const {requestState, waitingState} = ctx;
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
        ctx.waitingState = newWaitingState; //modify the waiting state for storage
        next();
    }
}
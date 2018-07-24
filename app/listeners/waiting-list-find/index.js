module.exports = {
    //logic for determining the request to pick:
    //if the waiting list is empty, return null
    //if the waiting list has all claimed, return null
    //if the waiting list has all waiting or claimed, return a non-claimed request whose queue is the lowest number
    //if there is a non-claimed, non-waiting request, return that request
    //assume that there can only be one request that is non-claimed, non-waiting
    "waiting-find": async (ctx, next) => {
        const waitingState = ctx.waitingState;
        let lowestIndex = Infinity;
        let lowestKey = null;
        for (let key in waitingState) {
            const value = waitingState[key].queue;
            const state = waitingState[key].state;
            if (state !== "claimed" && state !== "waiting") {
                ctx.currentRequest = waitingState[key];
                return next(); //found a request to handle
            }
            if (state === "waiting" && value < lowestIndex) {
                lowestIndex = value; //found a request whose id is longer
                lowestKey = key;
            }
        }
        ctx.currentRequest = waitingState[lowestKey];
        return next();
    },
}

const config = require('../../config.js');
const {store, job, logger, websocket} = config;

//module that handles transmitting information to clients connected over websockets
module.exports = {
    "post-waiting-job-advance": async (ctx, next) => {
        //find all requests in the claimed state first
        const claimedRequests = [];
        for (let id in ctx.waitingState) {
            if (ctx.waitingState[id].state === "claimed") {
                claimedRequests.push(ctx.waitingState[id]);
            }
        }

        //parse through all claimed requests and send the address information to the clients
        claimedRequests.forEach(async request => {
            const id = request.id;
            websocket.send(id, JSON.stringify(request.services));
        });

        next();
    }
}
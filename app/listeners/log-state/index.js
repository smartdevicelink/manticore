const logger = require('../../config.js').logger;

//module that handles logging of different state changes
module.exports = {
    "pre-request": async (ctx, next) => {
        logger.debug("New request state: " + JSON.stringify(ctx.requestState));
        next();
    },
    "pre-waiting-find": async (ctx, next) => {
        //cut off the 'request' and 'id' property of each user for the sake of brevity
        //modifying the context in a pre/post hook is forbidden. clone it
        const clonedState = JSON.parse(JSON.stringify(ctx.waitingState));
        for (let id in clonedState) {
            delete clonedState[id].request;
            delete clonedState[id].id;
        }
        logger.debug("Current waiting list: " + JSON.stringify(clonedState));
        next();
    },
}
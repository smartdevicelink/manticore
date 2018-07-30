const check = require('check-types');
const jwt = require('koa-jwt');
const websockify = require('koa-websocket');
const API_PREFIX = "/api/v2";
const logic = require('./app');
const config = require('./app/config.js');
const utils = require('./app/utils.js');
const {logger, websocket} = config;

module.exports = app => {
    /* MIDDLEWARE */

    //all routes under /api/v2 are eligible for identification via JWT if enabled
    if (config.jwtSecret) {
        app.use(async (ctx, next) => {
            if (!ctx.request.url.startsWith(API_PREFIX)) return await next();
            await jwt({secret: config.jwtSecret});
            await next();
        });
    }

    //consolidate the identification types to the id property in the body
    app.use(async (ctx, next) => {
        if (config.jwtSecret && ctx.request.user) {
            var id = ctx.request.user.user_id;
            ctx.request.body.id = id;
        }
        await next();
    });

    /* API ROUTES */

    //return all viable job types
    app.use(async (ctx, next) => {
        if (ctx.request.url !== `${API_PREFIX}/job` || ctx.method !== "GET") return await next();
        logger.debug(`GET ${API_PREFIX}/job`);
        ctx.response.body = await logic.getJobInfo();
    });

    //submit a job for a user
    app.use(async (ctx, next) => {
        if (ctx.request.url !== `${API_PREFIX}/job` || ctx.method !== "POST") return await next();
        logger.debug(`POST ${API_PREFIX}/job\n` + JSON.stringify(ctx.request.body));
        //user id check
        const ID = ctx.request.body.id;
        if (!check.string(ID)) return handle400(ctx, "Invalid or missing id");
        //validate the input
        const result = await logic.validateJob(ctx.request.body);
        if (!result.isValid) return handle400(ctx, result.errorMessage);
        //attempt to store the user request
        const wsAddress = await logic.storeRequest(ID, result.body)
            .catch(err => logger.error(err));
        ctx.response.status = 200;
        ctx.response.body = {
            address: wsAddress
        };
    }); 

    //stops a job for a user
    app.use(async (ctx, next) => {
        if (ctx.request.url !== `${API_PREFIX}/job` || ctx.method !== "DELETE") return await next();
        logger.debug(`DELETE ${API_PREFIX}/job`);
        //user id check
        const ID = ctx.request.body.id;
        if (!check.string(ID)) return handle400(ctx, "Invalid or missing id");
        //attempt to delete the user request
        await logic.deleteRequest(ID)
            .catch(err => logger.error(err));
        ctx.response.status = 200;
    });

    //hook up websockets to koa
    websockify(app);

    //websocket route for sending job information
    app.ws.use(async (ctx, next) => {
        if (ctx.request.url !== `${API_PREFIX}/job`) return await next();

        let foundId = null;
        //listen for messages. expecting a message with a "code" property containing the passcode
        //received from the HTTP POST job route
        ctx.websocket.on('message', async msgString => {
            const msg = await utils.parseJson(msgString);
            if (!msg.code) return;
            //pass the websocket to the interface so that it may handle the connection
            const id = await websocket.validate(msg.code, ctx.websocket);
            if (id === null) return;
            foundId = id;
            logger.debug(`New connection from request ${id}`);
        });

        ctx.websocket.on('close', async message => {
            logger.debug(`Connect dropped from request ${foundId}`);
            //reset the passcode for this user
            await websocket.validate(foundId);
        });

    });

}

//400 helper function
function handle400 (ctx, msg) {
    ctx.response.status = 400;
    ctx.response.body = {
        error: msg
    }
}
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

    //websocket route for sending job information. manage the connections here
    //the middleware is similar to listening to the 'open' event for a ws connection
    app.ws.use(async (ctx, next) => {
        //use the route that the client connects with as a validation measure
        //expected route: /api/v2/job/<PASSCODE>
        const route = '/api/v2/job/';
        const url = ctx.request.url;
        if (!url.startsWith(route)) { //wrong path. refuse connection
            ctx.websocket.close();
            return await next();
        }

        //the final part of the path
        const passcode = url.substring(route.length);
        //for passcode validation. bring back the id associated with the passcode
        const id = await websocket.validate(passcode, ctx.websocket);
        if (id === null) { //wrong passcode. refuse connection
            ctx.websocket.close();
            return await next();
        }

        //validated and found the id! listen to future events
        logic.onConnection(id, ctx.websocket); 

        ctx.websocket.on('message', async message => {
            logic.onMessage(id, message, ctx.websocket); 
        });

        ctx.websocket.on('close', async () => {
            //reset the passcode for this user
            await websocket.deletePasscode(id);
            logic.onDisconnection(id, ctx.websocket);
        });         

        next();
    });
}

//400 helper function
function handle400 (ctx, msg) {
    ctx.response.status = 400;
    ctx.response.body = {
        error: msg
    }
}
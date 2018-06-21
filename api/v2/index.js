const check = require('check-types');
const jwt = require('koa-jwt');
const API_PREFIX = "/api/v2";
const logic = require('../../app');
const config = require('../../app/config.js');
const {logger} = config;

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
        //success. attempt to store the user request
        ctx.response.status = 200;
        logic.storeRequest(ID, result.body)
            .catch(err => logger.error(err));
    });
}

//400 helper function
function handle400 (ctx, msg) {
    ctx.response.status = 400;
    ctx.response.body = {
        error: msg
    }
}
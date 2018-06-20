const config = require('../../config.js');
const {store, services, job, logger} = config;
const check = require('check-types');
const jwt = require('koa-jwt');
const API_PREFIX = "/api/v2";

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
    //TODO: make the asyncs not anonymous and attach catch handlers? or just try/catch inside the func?

    //return all viable job types
    app.use(async (ctx, next) => {
        if (ctx.request.url !== `${API_PREFIX}/job` || ctx.method !== "GET") return await next();
        logger.debug(`GET ${API_PREFIX}/job`);
        //call the job interface for getting the response body
        ctx.response.body = await job.get();
    });

    //submit a job for a user
    app.use(async (ctx, next) => {
        if (ctx.request.url !== `${API_PREFIX}/job` || ctx.method !== "POST") return await next();
        logger.debug(`POST ${API_PREFIX}/job\n` + JSON.stringify(ctx.request.body));
        //user id check
        const ID = ctx.request.body.id;
        if (!check.string(ID)) return handle400(ctx, "Invalid or missing id");
        //validate the input using the job interface
        const result = await job.validate(ctx.request.body);
        if (!result.isValid) return handle400(ctx, result.errorMessage);
        //success. attempt to store the user request
        await store.cas('manticore/requests', requestState => {
            try {
                requestState = JSON.parse(requestState);
            } catch (err) { //no JSON here. initialize
                requestState = {};
            }
            if (requestState[ID]) return requestState; //request already exists
            requestState[ID] = result.body; //store the result of the job validation
            return JSON.stringify(requestState);
        }).catch(err => logger.error(err));
        ctx.response.status = 200;
    });
}

//400 helper function
function handle400 (ctx, msg) {
    ctx.response.status = 400;
    ctx.response.body = {
        error: msg
    }
}

/*
services.watch('consul', function (data) {
    console.log(data);
});
services.watch('nomad', function (data) {
    console.log(data);
});
services.watch('nomad-client', function (data) {
    console.log(data);
});
*/
//listen to changes in the remote store
/*
store.watch('manticore/requests', function (data) {
    console.log("UPDATE");
    console.log(data);
}).catch(function (err) {
    console.log(err);
});


//to set a value, a get must be run first
try {
    store.cas('manticore/requests', function (value) {
        //its the value of the key. may be undefined
        return "wow";
    }).then(function (result) {
        console.log(result);
    });
}
catch (err) {
    console.log(err);
}
*/
/*
    console.log(ctx.request.method);
    console.log(ctx.request.query);
    console.log(ctx.request.host);
*/
const config = require('./config.js');
const state = require('./interfaces/state/' + config.state);
const services = require('./interfaces/services/' + config.services);
const job = require('./interfaces/job/' + config.job);
const logger = require('./interfaces/logger/' + config.logger);
const check = require('check-types');
const jwt = require('koa-jwt');

//endpoints are defined here
module.exports = app => {
    //all routes under /v2 are eligible for indentification via JWT if enabled
    if (config.jwtSecret) {
        app.use(async (ctx, next) => {
            if (!ctx.request.url.startsWith("/v2")) return await next();
            await jwt({secret: config.jwtSecret});
            await next();
        });
    }

    //consolidate the identification types
    app.use(async (ctx, next) => {
        console.log(ctx.request);
        console.log(ctx.request.body);
    });

    //return all viable job types
    app.use(async (ctx, next) => {
        if (ctx.request.url !== "/v2/job" || ctx.method !== "GET") return await next();
        //call the job interface for getting the response body
        ctx.response.body = await job.get();
    });
    //submit a job for a user
    app.use(async (ctx, next) => {
        if (ctx.request.url !== "/v2/job" || ctx.method !== "POST") return await next();
        //user id check
        if (!check.string(ctx.request.body.id)) return handle400(ctx, "Invalid id");
        //check if the user is already being managed (in waiting list, has an instance, etc.)
        const isManaged = false;
        //validate the input using the job interface
        const result = await job.validate(ctx.request.body);
        if (!result.isValid) return handle400(ctx, result.errorMessage);
        //success
        ctx.response.status = 200;
        //const body = result.body;
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
//listen to changes in the remote state
/*
state.watch('manticore/requests', function (data) {
    console.log("UPDATE");
    console.log(data);
}).catch(function (err) {
    console.log(err);
});


//to set a value, a get must be run first
try {
    state.cas('manticore/requests', function (value) {
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
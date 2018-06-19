const config = require('./config.js');
const state = require('./interfaces/state/' + config.state);
const services = require('./interfaces/services/' + config.services);
const job = require('./interfaces/job/' + config.job);
const logger = require('./interfaces/logger/' + config.logger);

//endpoints are defined here
module.exports = app => {
    //return all viable job types
    app.use(async (ctx, next) => {
        if (ctx.request.url !== "/job" || ctx.method !== "GET") return await next();
        ctx.response.body = await job.get();
    });
    //submit a job of a certain type, including some form of identification
    app.use(async (ctx, next) => {
        if (ctx.request.url !== "/job" || ctx.method !== "POST") return await next();
        if (!job.validate(ctx.request.body)) return handle400(ctx, "Invalid job submission");
        //success
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
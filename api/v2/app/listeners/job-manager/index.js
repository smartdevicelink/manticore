const config = require('../../config.js');
const {store, job, logger} = config;

module.exports = {
    "waiting-job-advance": async (ctx, next) => {
        await job.advance(ctx);
        next();
    }
}
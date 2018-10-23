// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const {store, job, logger} = config;

module.exports = {
    "waiting-job-advance": async (ctx, next) => {
        await job.advance(ctx).catch(err => logger.error(new Error(err).stack));
        next();
    }
}
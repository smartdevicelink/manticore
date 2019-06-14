// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const {job, logger, websocket} = config;
const utils = require('../../utils');

module.exports = {
    //deletes jobs of removed users
    "removed-request": async (ctx, next) => {
        const id = ctx.id;
        logger.debug(`Stopping job of user ${id}`); //core-hmi-${id}
        const jobName = await job.idToJobName(id);
        await utils.stopJob(jobName, true); //purge the job from Nomad
        //inform the client that the job is now gone
        const msgObj = {
            type: "dead",
            data: {}
        };
        await websocket.send(id, JSON.stringify(msgObj));
        //delete the passcode for this user
        await websocket.deletePasscode(id);
        next();
    }
}
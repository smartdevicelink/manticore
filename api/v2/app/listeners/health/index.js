/*
 * Copyright (c) 2018 Livio, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the
 * distribution.
 *
 * Neither the name of the Livio Inc. nor the names of its contributors
 * may be used to endorse or promote products derived from this software
 * without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
*/

//module that determines the healthiness of the Manticore system by remembering results of job submissions

const index = require('../../index.js');
const config = require('../../config.js');
const {store, job, logger, websocket} = config;

const INTERNAL_JOB_NAME = "internal-health-check"; //the id of this module's request
let requestHistory = [];
let timer = null; //the health update timer
//A group ids in a hash that are not expected to get a healthy job back, preventing an unhealthy report
const pardonedIds = {}; 

//do not listen to events if healthCheck is disabled
if (!config.modes.healthCheck) return module.exports = {};

module.exports = {
    //listen on post-startup so that the server can react to adding the request to the store
    "post-startup": async (ctx, next) => {
        //don't hold up the stack or this function
        next();
        //submit a job to determine the health state of the system
        await submitJob();
    },
    //if the waiting list is filled and if this internal job is queued up, it will remain
    //in the queue, unresolved until an attempt to run the job can happen
    "post-waiting-job-advance": async (ctx, next) => {
        //only continue if a request was selected for action
        if (!ctx.currentRequest) return next();

        let resolved = false;

        if (ctx.removeUser) { //an error happened with the request
            //if the id is in the pardonedIds group, then this does not count as a failure
            const success = pardonedIds[ctx.currentRequest.id] === true
            requestHistory.push({
                id: ctx.currentRequest.id,
                success: success,
                stuckWaiting: false,
                date: Date.now()
            });
            restartTimer(false); //unhealthy
            resolved = true;
        }
        else if (ctx.currentRequest.state === "claimed") { //the request reached a success
            requestHistory.push({
                id: ctx.currentRequest.id,
                success: true,
                stuckWaiting: false,
                date: Date.now()
            });
            restartTimer(true); //healthy
            resolved = true;
        }
        else if (ctx.currentRequest.state !== "claimed" && !ctx.updateStore) {
            //the current request is stuck in a non-claimed state
            requestHistory.push({
                id: ctx.currentRequest.id,
                success: false,
                stuckWaiting: true,
                date: Date.now()
            });
            restartTimer(false); //unhealthy
            resolved = true;
        }

        if (resolved && ctx.currentRequest.id === INTERNAL_JOB_NAME) {
            //the job submitted by this module has reached its conclusion. delete the request
            await index.deleteRequest(ctx.currentRequest.id);
        }

        next();
    },
    "health": async (ctx, next) => {
        //get the most recent event in requestHistory
        if (requestHistory.length === 0) { //no history yet. default to failing
            ctx.isHealthy = false;
            ctx.stuckWaiting = false;
        }
        else {
            const recentStatus = requestHistory[requestHistory.length - 1];
            ctx.isHealthy = recentStatus.success;
            ctx.stuckWaiting = recentStatus.stuckWaiting;            
        }
        next();
    },
    "removed-request": async (ctx, next) => {
        pardonedIds[ctx.id] = true; //add the id to the pardoned group
        next();
    },
    "pre-request": async (ctx, next) => {
        //all newly added requests' ids are to be removed from the pardoned group
        const { waitingState, requestState } = ctx;
        const waitingIds = Object.keys(waitingState)
        const newIds = Object.keys(requestState).filter(id => waitingIds.indexOf(id) === -1)
        newIds.forEach(id => {
            delete pardonedIds[id]
        });
        next();
    }
}


//run an internal health check every once in a while to update the health state
function restartTimer () {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }

    timer = setTimeout(() => {
        //start the job submission process to manually figure out the health state of manticore
        submitJob();
    }, config.healthCheckPeriod * 1000); //do this in healthCheckPeriod seconds
}

//submit a fake job to Manticore and check whether the job can be successfully submitted
async function submitJob () {
    //submit a job on this server's behalf
    const jobObj = job.exampleJobOption();
    jobObj.id = INTERNAL_JOB_NAME;
    const passcode = await index.storeRequest(INTERNAL_JOB_NAME, jobObj);
    //let the post-waiting-job-advance event handle the result of the job submission
}


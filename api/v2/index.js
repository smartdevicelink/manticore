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

const check = require('check-types');
const jwt = require('koa-jwt');
const websockify = require('koa-websocket');
const Router = require('koa-router');
const API_PREFIX = "/api/v2";
const logic = require('./app');
const config = require('./app/config.js');
const utils = require('./app/utils.js');
const {logger, websocket} = config;
const cors = require('koa-cors');

module.exports = app => {
    /* MIDDLEWARE */
    const router = new Router();

    if (config.cors || !config.webpageDisabled){
        app.use(cors());
    }

    //all routes under /api/v2 are eligible for identification via JWT if enabled
    if (config.modes.jwt) {
        app.use(jwt({secret: config.jwtSecret}).unless({path: [/^(?!\/api\/v2).+/]}));
    }

    //consolidate the identification types to the id property in the body
    app.use(async (ctx, next) => {
        if (config.modes.jwt && ctx.state.user) {
            ctx.request.body.id = '' + ctx.state.user.user_id;
        }
        await next();
    });

    /* API ROUTES */


    //health endpoints
    router.get(['/', '/health'], async (ctx, next) => {
        const status = await logic.getHealth();
        if (status.isHealthy) {
            ctx.response.status = 200;
        }
        else if (status.stuckWaiting) { //no more resources for jobs. not necessarily an issue
            ctx.response.status = 200;
        }
        else { //unhealthy due to job submission errors
            ctx.response.status = 500;
        }
    });

    //return all viable job types
    router.get(`${API_PREFIX}/job`, async (ctx, next) => {
        logger.debug(`GET ${API_PREFIX}/job`);
        ctx.response.body = await logic.getJobInfo()
            .catch(err => logger.error(new Error(err).stack));
    });

    //submit a job for a user
    router.post(`${API_PREFIX}/job`, async (ctx, next) => {
        logger.debug(`POST ${API_PREFIX}/job\n` + JSON.stringify(ctx.request.body));
        //user id check
        const ID = ctx.request.body.id;
        if (!check.string(ID)) return handle400(ctx, "Invalid or missing id");
        //validate the input
        const result = await logic.validateJob(ctx.request.body)
            .catch(err => logger.error(new Error(err).stack));
        if (!result.isValid) return handle400(ctx, result.errorMessage);
        //attempt to store the user request
        const wsAddress = await logic.storeRequest(ID, result.body)
            .catch(err => logger.error(new Error(err).stack));
        ctx.response.status = 200;

        //return address information to use for connection
        //these values change depending on the modes enabled
        ctx.response.body = {
            path: `${API_PREFIX}/job/`,
            protocol: 'ws',
            passcode: wsAddress,
        };

        if (config.modes.haproxy) {
            ctx.response.body.port = config.haproxyPort;
            ctx.response.body.domain = config.haproxyDomain;

            if (config.modes.elb) { //ws addresses (ELB)
                ctx.response.body.port = config.wsPort;
            }
            if (config.modes.elbEncryptWs) { //secure ws addresses (ELB)
                ctx.response.body.protocol = 'wss';
            }
        }
    });

    //stops a job for a user
    router.delete(`${API_PREFIX}/job`, async (ctx, next) => {
        logger.debug(`DELETE ${API_PREFIX}/job`);
        //user id check
        const ID = ctx.request.body.id;
        if (!check.string(ID)) return handle400(ctx, "Invalid or missing id");
        //attempt to delete the user request
        await logic.deleteRequest(ID)
            .catch(err => logger.error(new Error(err).stack));
        ctx.response.status = 200;
    });

    app.use(router.routes()); //load API router middleware

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

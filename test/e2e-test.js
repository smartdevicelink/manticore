/*
 * Copyright (c) 2019 Livio, Inc.
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

require('dotenv').config(); //load environment
const mocha = require('mocha');
const expect = require('chai').expect;
const faker = require('faker');
const request = require('request');

//set environment variables to be able to test locally
process.env.HTTP_PORT = 4000;
delete process.env.JWT_SECRET;
delete process.env.HAPROXY_HTTP_PORT;
delete process.env.HEALTH_CHECK_PERIOD;
delete process.env.USAGE_DURATION;

const Koa = require('koa');
const serve = require('koa-static');
const bodyParser = require('koa-bodyparser'); //for parsing JSON
const app = new Koa();
const config = require('../config');

//add ability to parse JSON from posts
app.use(bodyParser());

//setup all koa middleware under the selected version in /api
const loadedApi = require(`../api/${config.apiVersion}`);
loadedApi.start(app);

//uncaught error handler
app.use(async (ctx, next) => {
    try {
        await next();
    }
    catch (err) {
        console.error(err);
    }
});

const SERVER_URL = `localhost:${config.httpPort}`;
const SERVER_HTTP_JOB = `http://${SERVER_URL}/api/v2/job`;

async function http (url, options = {}) {
    return new Promise((resolve, reject) => {
        options.uri = url;
        request(options, function (err, res) {
            if (err) return reject(err);
            return resolve(res);
        });
    });
}

function asyncTimeout (ms) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

const server = app.listen(config.httpPort, function () {
    // the server has started. begin tests
    beforeEach(function () {
        
    });

    describe('healthiness', function () {
        it('should return a 200 on startup, with advanced health checking disabled (/)', async function () {
            const result = await http("http://" + SERVER_URL + "/");
            const body = JSON.parse(result.body);
            expect(body).to.be.an('object');
            expect(result.statusCode).to.equal(200);
        });

        it('should return a 200 on startup, with advanced health checking disabled (/health)', async function () {
            const result = await http("http://" + SERVER_URL + "/health");
            const body = JSON.parse(result.body);
            expect(body).to.be.an('object');
            expect(result.statusCode).to.equal(200);
        });
    });

    describe('job retrieval', function () {
        it('should return a sample job object configuration for submission', async function () {
            const result = await http(SERVER_HTTP_JOB);
            const body = JSON.parse(result.body);
            expect(body).to.be.an('object');
            expect(body).to.have.nested.property('core.versions[0]');
            expect(body).to.have.nested.property('core.builds[0]');
            expect(body).to.have.nested.property('hmis[0]');
            expect(body).to.have.nested.property('hmis[0].type');
            expect(body).to.have.nested.property('hmis[0].versions[0]');
        });
    });

    describe('job creation', function () {
        this.timeout(30000) // 30 seconds

        it('should submit a sample job and return websocket connection info for retreiving instance urls', async function () {
            const ultimateTester = require('./ultimate-load-tester/index.js');
            const individual = require('./job-submission/individual.js');
            let currentState;
            const aggregate = require('./job-submission/aggregate.js').bind(null, 1, 0, SERVER_URL, function (stats) {
               currentState = stats[0]
            });

            await ultimateTester.start(individual, aggregate)
            //wait for the state to update
            await asyncTimeout(1000)
            //read the last state received
            expect(currentState).to.be.an('object')
            expect(currentState).to.not.have.property('message')
            expect(currentState).to.have.property('services')
        });
    });

    describe('mass job creation', function () {
        this.timeout(150000) // 150 seconds

        it('should submit many jobs and have all of them be handled eventually, given enough resources', async function () {
            const ultimateTester = require('./ultimate-load-tester/index.js');
            const individual = require('./job-submission/individual.js');
            let currentState;
            const aggregate = require('./job-submission/aggregate.js').bind(null, 10, 2000, SERVER_URL, function (stats) {
               currentState = stats
            });

            await ultimateTester.start(individual, aggregate)
            //wait for the state to update
            await asyncTimeout(1000)
            //read the last state received
            for (let i = 0; i < 10; i++) {
                const individualState = currentState[i]
                expect(individualState).to.be.an('object')
                expect(individualState).to.not.have.property('message')
                expect(individualState).to.have.property('services')
            }
        });
    });

    afterEach(function () {
        
    });

    //done running tests. tear down server and watchers
    after(function () {
        server.close();
        loadedApi.stop();
    });
});


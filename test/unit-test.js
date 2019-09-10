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

const mocha = require('mocha');
const expect = require('chai').expect;
const faker = require('faker');
const CONFIG_LOCATION = '../config.js';

const propsToTest = {
    httpPort: { type: "number", skip: false, required: true, env: "HTTP_PORT" },
    jwtSecret: { type: "string", skip: false, required: false, env: "JWT_SECRET" },
    clientAgentIp: { type: "string", skip: false, required: true, env: "NOMAD_IP_http" },
    nomadAgentPort: { type: "number", skip: false, required: true, env: "NOMAD_AGENT_PORT" },
    consulAgentPort: { type: "number", skip: false, required: true, env: "CONSUL_AGENT_PORT" },
    logLevel: { type: "string", skip: false, required: true, env: "LOG_LEVEL" },
    apiVersion: { type: "string", skip: false, required: true, env: "API_VERSION" },
    haproxyPort: { type: "number", skip: false, required: false, env: "HAPROXY_HTTP_PORT" },
    haproxyDomain: { type: "string", skip: false, required: false, env: "DOMAIN_NAME" },
    tcpPortStart: { type: "number", skip: false, required: false, env: "TCP_PORT_RANGE_START" },
    tcpPortEnd: { type: "number", skip: false, required: false, env: "TCP_PORT_RANGE_END" },
    usageDuration: { type: "number", skip: false, required: false, env: "USAGE_DURATION" },
    warningDuration: { type: "number", skip: false, required: false, env: "WARNING_DURATION" },
    resetTimerAllowed: { type: "boolean", skip: false, required: false, env: "RESET_TIMER_ALLOWED" },
    webpageDisabled: { type: "boolean", skip: false, required: true, env: "WEBPAGE_DISABLED" },
    awsRegion: { type: "string", skip: false, required: false, env: "AWS_REGION" },
    awsHaproxyGroupId: { type: "string", skip: false, required: false, env: "AWS_HAPROXY_GROUP_ID" },
    awsElbGroupId: { type: "string", skip: false, required: false, env: "AWS_ELB_GROUP_ID" },
    elbName: { type: "string", skip: false, required: false, env: "ELB_MANTICORE_NAME" },
    elbEncryptHttp: { type: "boolean", skip: false, required: false, env: "ELB_ENCRYPT_HTTP" },
    elbEncryptWs: { type: "boolean", skip: false, required: false, env: "ELB_ENCRYPT_WS" },
    elbEncryptTcp: { type: "boolean", skip: false, required: false, env: "ELB_ENCRYPT_TCP" },
    sslCertificateArn: { type: "string", skip: false, required: false, env: "SSL_CERTIFICATE_ARN" },
    wsPort: { type: "number", skip: false, required: false, env: "ELB_WS_PORT" },
    cors: { type: "boolean", skip: false, required: false, env: "CORS" },
    healthCheckPeriod: { type: "number", skip: false, required: false, env: "HEALTH_CHECK_PERIOD" },
    minDelayBuffer: { type: "number", skip: false, required: true, env: "MIN_DELAY_BUFFER" },
    maxDelayBuffer: { type: "number", skip: false, required: true, env: "MAX_DELAY_BUFFER" },
    logger: { skip: true },
    store: { skip: true },
    job: { skip: true },
    websocket: { skip: true },
    modes: { skip: true },
};

function haproxyMode () {
    process.env.HAPROXY_HTTP_PORT = faker.random.number();
    process.env.DOMAIN_NAME = faker.lorem.word();
    process.env.TCP_PORT_RANGE_START = faker.random.number();
    process.env.TCP_PORT_RANGE_END = faker.random.number();
}

function elbMode () {
    process.env.AWS_REGION = faker.lorem.word();
    process.env.ELB_MANTICORE_NAME = faker.lorem.word();
    process.env.ELB_WS_PORT = faker.random.number();
}

describe('unit tests', function () {

    beforeEach(function () {
        delete require.cache[require.resolve(CONFIG_LOCATION)]; //clear the require cache
        for (let prop in propsToTest) {
            delete process.env[propsToTest[prop].env];
        }
    });

    describe('config.js', function () {
        describe('#completeness and correctness', function () {
            it('every property should be accounted for in the config object, with correct values', function () {
                const config = require(CONFIG_LOCATION);
                for (let prop in config) {
                    const testProp = propsToTest[prop];
                    expect(testProp.skip).to.be.a("boolean");
                    if (!testProp.skip) {
                        if (testProp.required) expect(config[prop], prop).to.be.a(testProp.type);
                        else expect(config[prop], prop).to.be.oneOf([undefined, testProp.type]);
                    }
                }
            });
        });


        describe('#mode activations', function () {
            it('haproxy mode enabled on specific env vars defined', function () {
                haproxyMode();

                const config = require(CONFIG_LOCATION);
                expect(config.modes.haproxy).to.equal(true);
            });

            it('inactivityTimer mode enabled on specific env vars defined', function () {
                process.env.USAGE_DURATION = faker.random.number();
                process.env.WARNING_DURATION = faker.random.number();
                process.env.RESET_TIMER_ALLOWED = false;
                
                const config = require(CONFIG_LOCATION);
                expect(config.modes.inactivityTimer).to.equal(true);
            });

            it('jwt mode enabled on specific env vars defined', function () {
                process.env.JWT_SECRET = faker.lorem.word();
                
                const config = require(CONFIG_LOCATION);
                expect(config.modes.jwt).to.equal(true);
            });

            it('aws mode enabled on specific env vars defined', function () {
                process.env.AWS_REGION = faker.lorem.word();
                
                const config = require(CONFIG_LOCATION);
                expect(config.modes.aws).to.equal(true);
            });

            it('elb mode enabled on specific env vars defined', function () {
                haproxyMode();
                elbMode();

                const config = require(CONFIG_LOCATION);
                expect(config.modes.elb).to.equal(true);
            });

            it('awsSecurityGroup mode enabled on specific env vars defined', function () {
                haproxyMode();
                elbMode();

                process.env.AWS_HAPROXY_GROUP_ID = faker.lorem.word();
                process.env.AWS_ELB_GROUP_ID = faker.lorem.word();

                const config = require(CONFIG_LOCATION);
                expect(config.modes.awsSecurityGroup).to.equal(true);
            });

            it('elbEncryptHttp mode enabled on specific env vars defined', function () {
                haproxyMode();
                elbMode();

                process.env.SSL_CERTIFICATE_ARN = faker.lorem.word();
                process.env.ELB_ENCRYPT_HTTP = true;

                const config = require(CONFIG_LOCATION);
                expect(config.modes.elbEncryptHttp).to.equal(true);
            });

            it('elbEncryptWs mode enabled on specific env vars defined', function () {
                haproxyMode();
                elbMode();

                process.env.SSL_CERTIFICATE_ARN = faker.lorem.word();
                process.env.ELB_ENCRYPT_WS = true;

                const config = require(CONFIG_LOCATION);
                expect(config.modes.elbEncryptWs).to.equal(true);
            });

            it('elbEncryptTcp mode enabled on specific env vars defined', function () {
                haproxyMode();
                elbMode();

                process.env.SSL_CERTIFICATE_ARN = faker.lorem.word();
                process.env.ELB_ENCRYPT_TCP = true;

                const config = require(CONFIG_LOCATION);
                expect(config.modes.elbEncryptTcp).to.equal(true);
            });

            it('healthCheck mode enabled on specific env vars defined', function () {
                process.env.HEALTH_CHECK_PERIOD = faker.random.number();

                const config = require(CONFIG_LOCATION);
                expect(config.modes.healthCheck).to.equal(true);
            });
            
        });
    });



    describe('job interface', function () {
        it('all expected exports should exist', function () {
            let config = require(CONFIG_LOCATION);
            config = require('../api/' + config.apiVersion + '/app/config.js');
            let job = config.job

            expect(job).to.have.property('jobOptions');
            expect(job.jobOptions).to.be.a('function');
            expect(job).to.have.property('validate');
            expect(job.validate).to.be.a('function');
            expect(job).to.have.property('advance');
            expect(job.advance).to.be.a('function');
            expect(job).to.have.property('idToJobName');
            expect(job.idToJobName).to.be.a('function');
            expect(job).to.have.property('formatAddresses');
            expect(job.formatAddresses).to.be.a('function');
            expect(job).to.have.property('exampleJobOption');
            expect(job.exampleJobOption).to.be.a('function');
        });

        it('the return of exampleJobOption should be a valid job object', async function () {
            let config = require(CONFIG_LOCATION);
            config = require('../api/' + config.apiVersion + '/app/config.js');
            let job = config.job

            const sampleJob = job.exampleJobOption();
            const validateResult = await job.validate(sampleJob);

            expect(validateResult).to.be.an('object');
            expect(validateResult.body).to.be.an('object');
            expect(validateResult.isValid).to.equal(true);
            expect(validateResult.errorMessage).to.equal(undefined);
        });
        
    });

});

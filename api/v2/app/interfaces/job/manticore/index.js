// Copyright (c) 2018, Livio, Inc.
const builder = require('nomad-helper');
const config = require('./config');
const coreSettings = require('./core-image-settings');
const hmiSettings = require('./hmi-image-settings');
const logger = config.logger;
const utils = require('../../../utils.js'); //contains useful functions for the job submission process

const randomString = require('randomatic');
const PATTERN = 'af09';
const PORTS_USED_THRESHOLD = .5;

//times to wait for healthy instances in milliseconds
const CORE_ALLOCATION_TIME = 5000;
const CORE_HEALTH_TIME = 8000;
const HMI_ALLOCATION_TIME = 5000;
const HMI_HEALTH_TIME = 8000;


const jobInfo = {
    core: {
        versions: ["5.0.1"], //ex. 5.0.1, master, develop
        builds: ["default"]
    }, 
    hmis: [{
        type: "generic",
        versions: ["minimal-0.5.1"] //ex. master, minimal-0.5.1
    }]
};

async function jobOptions () {
    return jobInfo;
}

/*
expected input:
{
    id: 1,
    core: {
        version: "master",
        build: "default"
    },
    hmi: {
        type: "generic",
        version: "minimal"
    }
}

expected output:
{
    body: {}, //if isValid is true, this body gets sent to manticore to be stored for future reference
    isValid: false, //determines whether manticore should approve of the request
    errorMessage: "" //if isValid is false, this message gets sent to the user with a 400 status code
}
*/
async function validate (body) {
    if (!body || !body.core || !body.hmi) {
        return createErrorResponse("Request body is invalid");
    }

    const coreVersionValid = jobInfo.core.versions.includes(body.core.version);
    const coreBuildValid = jobInfo.core.builds.includes(body.core.build);
    const hmiTypeIndex = jobInfo.hmis.findIndex(elem => {
        return elem.type === body.hmi.type; 
    });
    const hmiVersionValid = hmiTypeIndex !== -1 && jobInfo.hmis[hmiTypeIndex].versions.includes(body.hmi.version);
    
    if (!coreVersionValid) {
        return createErrorResponse("Not a valid core version: " + body.core.version);
    }
    if (!coreBuildValid) {
        return createErrorResponse("Not a valid core build option: " + body.core.build);
    }
    if (hmiTypeIndex === -1) {
        return createErrorResponse("Not a valid hmi type: " + body.hmi.type);
    }
    else if (!hmiVersionValid) {
        return createErrorResponse("Not a valid hmi version: " + body.hmi.version);
    }

    //the response is valid at this point. clean the input
    return {
        body: { //response to store
            core: {
                version: body.core.version,
                build: body.core.build
            },
            hmi: {
                type: body.hmi.type,
                version: body.hmi.version
            }
        },
        isValid: true
    };
}

function createErrorResponse (message) {
    return {
        body: {},
        isValid: false,
        errorMessage: message
    }
}


//responsible for advancing the state of the job for a request
//can modify the context object passed in from manticore
async function advance (ctx) {
    //note: modify currentRequest as a shortcut to modifying waitingState
    const {currentRequest, waitingState} = ctx;
    const {id, request} = currentRequest;
    const {version: coreVersion, build} = request.core;
    const {version: hmiVersion, type} = request.hmi;

    const jobName = `core-hmi-${id}`;
    const coreTaskName = `core-task-${id}`;
    const hmiTaskName = `hmi-task-${id}`;

    //perform a different action depending on the current state
    if (currentRequest.state === "waiting") { //this stage causes a core job to run
        const job = coreSettings.generateJobFile(jobName, currentRequest);
        const jobFile = job.getJob().Job;

        await utils.autoHandleAll({
            ctx: ctx,
            job: jobFile,
            allocationTime: CORE_ALLOCATION_TIME,
            healthTime: CORE_HEALTH_TIME,
            stateChangeValue: "pending-1",
            servicesKey: "manticore"
        });

        return; //done
    }
    //this stage generates external core address values for haproxy mode and stores them for future use
    if (currentRequest.state === "pending-1") {
        //if haproxy is configured, generate the external addresses
        if (config.modes.haproxy) {
            //ensure that the tcp port numbers generated haven't been used before
            //make the string addresses long enough to be improbable for collisions to ever happen
            const usedTcpPorts = getUsedTcpPorts(waitingState);
            const coreTcpPort = await generateTcpPort(config.tcpPortStart, config.tcpPortEnd, usedTcpPorts);

            currentRequest.services.manticore[`core-broker-${id}-0`].external = randomString(PATTERN, 16);
            currentRequest.services.manticore[`core-broker-${id}-0`].isHttp = true;

            currentRequest.services.manticore[`core-file-${id}-0`].external = randomString(PATTERN, 16);
            currentRequest.services.manticore[`core-file-${id}-0`].isHttp = true;

            currentRequest.services.manticore[`core-log-${id}-0`].external = randomString(PATTERN, 16);
            currentRequest.services.manticore[`core-log-${id}-0`].isHttp = true;

            currentRequest.services.manticore[`core-tcp-${id}-0`].external = coreTcpPort;
            currentRequest.services.manticore[`core-tcp-${id}-0`].isHttp = false;

            currentRequest.state = "pending-2";
            ctx.updateStore = true;
            ctx.removeUser = false;
            return; //done. wait for the next cycle for the next phase
        }
        currentRequest.state = "pending-2";
        //immediately proceed to the next phase, as nothing needs to be stored here
    }
    if (currentRequest.state === "pending-2") { //this stage causes an hmi job to run
        const brokerAddress = currentRequest.services.manticore[`core-broker-${id}-0`].internal;
        const coreFileAddress = currentRequest.services.manticore[`core-file-${id}-0`].internal;

        let fullBrokerAddress = `ws:\\/\\/${brokerAddress}`; //internal address

        //if haproxy is configured, generate the external addresses
        if (config.modes.haproxy) {
            //domain addresses
            const externalBrokerAddress = currentRequest.services.manticore[`core-broker-${id}-0`].external;
            const brokerDomainAddress = `${externalBrokerAddress}.${config.haproxyDomain}`;

            //external address (HAProxy)
            fullBrokerAddress = `ws:\\/\\/${brokerDomainAddress}:${config.haproxyPort}`; 

            if (config.modes.elb) { //external address (ELB)
                fullBrokerAddress = `ws:\\/\\/${brokerDomainAddress}:${config.wsPort}`;
            }
            
            if (config.modes.elbEncryptWs) { //secure external address (ELB)
                fullBrokerAddress = `wss:\\/\\/${brokerDomainAddress}:${config.wsPort}`; 
            }            
        }

        const envs = { //extract service addresses found from the previous stage
            brokerAddress: fullBrokerAddress,
            coreFileAddress: coreFileAddress,
        };

        let job = coreSettings.generateJobFile(jobName, currentRequest);
        //add the hmi task group
        job = hmiSettings.generateJobFile(job, currentRequest, envs);

        const jobFile = job.getJob().Job;

        await utils.autoHandleAll({
            ctx: ctx,
            job: jobFile,
            allocationTime: HMI_ALLOCATION_TIME,
            healthTime: HMI_HEALTH_TIME,
            stateChangeValue: "pending-3", 
            servicesKey: "manticore"
        });

        return; //done
    }
    //this stage generates external hmi address values for haproxy mode and stores them for future use
    if (currentRequest.state === "pending-3") {
        //if haproxy is configured, generate the external addresses
        if (config.modes.haproxy && currentRequest.services.manticore) {
            currentRequest.services.manticore[`hmi-user-${id}-0`].external = randomString(PATTERN, 16);
            currentRequest.services.manticore[`hmi-user-${id}-0`].isHttp = true;

            currentRequest.state = "pending-4";
            ctx.updateStore = true;
            ctx.removeUser = false;
            return; //done. wait for the next cycle for the next phase
        }
        currentRequest.state = "pending-4";
        //immediately proceed to the next phase, as nothing needs to be stored here
    }
    //this additional phase ensures that modules listening on "post-waiting-job-advance" have the correct info
    //since it has been stored in the KV store
    if (currentRequest.state === "pending-4") {
        //all addresses have been finalized and the jobs are healthy. done
        currentRequest.state = "claimed";
        ctx.updateStore = true;
        ctx.removeUser = false;
        return;
    }

}

//given an id, return the full name of the job
async function idToJobName (id) {
    return `core-hmi-${id}`;
}


//use the waiting state to find all used tcp ports
function getUsedTcpPorts (waitingState) {
    let usedPorts = [];
    for (let id in waitingState) {
        const cond1 = waitingState[id].services !== undefined;
        const cond2 = cond1 && waitingState[id].services.manticore !== undefined;
        const cond3 = cond2 && waitingState[id].services.manticore[`core-tcp-${id}-0`].external !== undefined;
        if (cond3) {
            usedPorts.push(waitingState[id].services.manticore[`core-tcp-${id}-0`].external);
        }
    }
    return usedPorts;
}

//continue to create random numbers between min and max until one isn't in the blacklisted ports
//WARNING: will get much slower the greater the percentage of possible ports are taken. make sure 
//the range is always large enough for your load!
async function generateTcpPort (min, max, blacklistedPorts) {
    //start printing warnings if a significant percentage of ports are already taken
    const range = max - min + 1;
    const portsTakenPercentage = blacklistedPorts.length / range;
    if (portsTakenPercentage >= PORTS_USED_THRESHOLD) {
        logger.warn(new Error("Port supply running low! Percentage used: " + portsTakenPercentage).stack);
    }
    let foundPort = false;
    let port;
    while (!foundPort) {
        port = Math.floor(Math.random() * range) + min;
        foundPort = !blacklistedPorts.includes(port);
    }

    return port;
}

//given a services object, formats the addresses in some friendly manner and returns them for a client
function formatAddresses (id, services) {
    return {
        "core-broker": utils.formatWsAddress(services.manticore[`core-broker-${id}-0`]),
        "core-tcp": utils.formatTcpAddress(services.manticore[`core-tcp-${id}-0`]),
        "core-file": utils.formatHttpAddress(services.manticore[`core-file-${id}-0`]),
        "core-log": utils.formatWsAddress(services.manticore[`core-log-${id}-0`]),
        "hmi-user": utils.formatHttpAddress(services.manticore[`hmi-user-${id}-0`]),
    };
}

//returns some valid job configuration that could be used as a request
function exampleJobOption () {
    return {
        core: {
            version: "5.0.1",
            build: "default"
        },
        hmi: {
            type: "generic",
            version: "minimal-0.5.1"
        }
    };
}

module.exports = {
    jobOptions: jobOptions,
    validate: validate,
    advance: advance,
    idToJobName: idToJobName,
    formatAddresses: formatAddresses,
    exampleJobOption: exampleJobOption
}

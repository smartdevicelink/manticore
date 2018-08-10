const builder = require('nomad-helper');
const http = require('async-request');
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
        versions: ["4.5.1"], //ex. 4.5.1, master, develop
        builds: ["default"]
    }, 
    hmis: [{
        type: "generic",
        versions: ["minimal"] //ex. master, minimal
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

//for caching jobs for future reference, using the id as the key
let cachedJobs = {};

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
        const imageInfo = coreSettings.configurationToImageInfo(coreVersion, build, id);

        await utils.autoHandleAll({
            ctx: ctx,
            job: jobFile,
            taskNames: [coreTaskName],
            allocationTime: CORE_ALLOCATION_TIME,
            services: imageInfo.services,
            healthTime: CORE_HEALTH_TIME,
            stateChangeValue: "pending-1",
            servicesKey: "core"
        });

        //cache the core job so it doesn't need to be generated again in future stages
        cachedJobs[id] = job;
        return; //done
    }
    if (currentRequest.state === "pending-1") { //this stage causes an hmi job to run
        const brokerAddress = currentRequest.services.core[`core-broker-${id}`].internal;
        const coreFileAddress = currentRequest.services.core[`core-file-${id}`].internal;
        const envs = { //extract service addresses found from the previous stage
            brokerAddress: `ws:\\/\\/${brokerAddress}`,
            coreFileAddress: `${coreFileAddress}`,
        };
        //build off the cached core job if it exists
        if (!cachedJobs[id]) {
            cachedJobs[id] = coreSettings.generateJobFile(jobName, currentRequest);
        }
        const job = hmiSettings.generateJobFile(cachedJobs[id], currentRequest, envs);

        const jobFile = job.getJob().Job;
        const imageInfo = hmiSettings.configurationToImageInfo(hmiVersion, type, id, envs);

        await utils.autoHandleAll({
            ctx: ctx,
            job: jobFile,
            taskNames: [coreTaskName, hmiTaskName],
            allocationTime: HMI_ALLOCATION_TIME,
            services: imageInfo.services,
            healthTime: HMI_HEALTH_TIME,
            stateChangeValue: "claimed", //final transition
            servicesKey: "hmi"
        });

        //if haproxy is configured, generate the external addresses
        if (config.haproxyPort) {
            //ensure that the tcp port numbers generated haven't been used before
            //make the string addresses long enough to be improbable for collisions to ever happen
            const usedTcpPorts = getUsedTcpPorts(ctx.waitingState);
            const coreTcpPort = await generateTcpPort(config.tcpPortStart, config.tcpPortEnd, usedTcpPorts);

            ctx.currentRequest.services.core[`core-broker-${id}`].external = randomString(PATTERN, 16);
            ctx.currentRequest.services.core[`core-broker-${id}`].isHttp = true;

            ctx.currentRequest.services.core[`core-file-${id}`].external = randomString(PATTERN, 16);
            ctx.currentRequest.services.core[`core-file-${id}`].isHttp = true;

            ctx.currentRequest.services.core[`core-log-${id}`].external = randomString(PATTERN, 16);
            ctx.currentRequest.services.core[`core-log-${id}`].isHttp = true;

            ctx.currentRequest.services.core[`core-tcp-${id}`].external = coreTcpPort;
            ctx.currentRequest.services.core[`core-tcp-${id}`].isHttp = false;
            
            ctx.currentRequest.services.hmi[`hmi-user-${id}`].external = randomString(PATTERN, 16);
            ctx.currentRequest.services.hmi[`hmi-user-${id}`].isHttp = true;
        }

        console.log("job done!");
        console.log(JSON.stringify(ctx.currentRequest.services));

        return; //done
    }

}

//given an id, return the full name of the job
async function idToJobName (id) {
    return `core-hmi-${id}`;
}

//given an id, return all the task names possible for the job
async function idToTaskNames (id) {
    const coreTaskName = `core-task-${id}`;
    const hmiTaskName = `hmi-task-${id}`;
    return [coreTaskName, hmiTaskName];
}

//use the waiting state to find all used tcp ports
function getUsedTcpPorts (waitingState) {
    let usedPorts = [];
    for (let id in waitingState) {
        usedPorts.push(waitingState[id].services.core[`core-tcp-${id}`].external);
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
        logger.warn("Port supply running low! Percentage used: " + portsTakenPercentage);
    }
    let foundPort = false;
    let port;
    while (!foundPort) {
        port = Math.floor(Math.random() * range) + min;
        foundPort = !blacklistedPorts.includes(port);
    }
    return port;
}

module.exports = {
    jobOptions: jobOptions,
    validate: validate,
    advance: advance,
    idToJobName: idToJobName,
    idToTaskNames: idToTaskNames
}

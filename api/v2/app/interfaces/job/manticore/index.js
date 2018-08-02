const builder = require('nomad-helper');
const http = require('async-request');
const config = require('./config');
const coreSettings = require('./core-image-settings');
const hmiSettings = require('./hmi-image-settings');
const logger = config.logger;
const utils = require('../../../utils.js'); //contains useful functions for the job submission process

const randomString = require('randomatic');
const pattern = 'af09'
const consul = require('../../store/consul-kv/index.js');

//times to wait for healthy instances in milliseconds
const CORE_ALLOCATION_TIME = 2000;
const CORE_HEALTH_TIME = 8000;
const HMI_ALLOCATION_TIME = 2000;
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
    id: 1 (optional),
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

//TODO: remove these two?
async function getRunningJobs () {
    const result = await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/jobs?prefix=core-hmi-`);
    const jobInfo = await parseJson(result.body);
    
}

//helper function for converting strings to JSON
async function parseJson (string) {
    try {
        return JSON.parse(string);
    } catch (err) { //invalid JSON here. initialize to empty object
        logger.error(new Error("Invalid JSON string: " + string).stack);
        return {};
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
        //build off the cached core job
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

        console.log("job done!");
        console.log(JSON.stringify(ctx.currentRequest.services));

        //if haproxy is configured, generate the external addresses
        if(config.haproxyPort){
            ctx.currentRequest.services.core[`core-broker-${id}`].external = checkExternalAddress(`core-broker-${id}`);
            ctx.currentRequest.services.core[`core-file-${id}`].external = checkExternalAddress(`core-broker-${id}`);
            ctx.currentRequest.services.core[`core-log-${id}`].external = checkExternalAddress(`core-broker-${id}`);
            ctx.currentRequest.services.core[`core-tcp-${id}`].external = Math.floor(Math.random() * 10000);
            ctx.currentRequest.services.hmi[`hmi-user-${id}`].external = checkExternalAddress(`core-broker-${id}`);
        }

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

//given a service name, return its external address from the kv store
function getExternalAddress(addressName){
    return consul.cas(`haproxy/${addressName}`);
}

//given a service name, generate and store an external address
function setExternalAddress(addressName){
    let name = randomString(pattern, 16);
    consul.set({
        key: `haproxy/${addressName}`,
        value: name
    });
    return name;
}

//given a service name, check if the external address exists and return
//else generate an appropriate address
function checkExternalAddress(addressName){
    let name = getExternalAddress(addressName).data;
    if(name){
        return name;
    }
    return setExternalAddress(addressName);
}

module.exports = {
    jobOptions: jobOptions,
    validate: validate,
    advance: advance,
    idToJobName: idToJobName,
    idToTaskNames: idToTaskNames
}

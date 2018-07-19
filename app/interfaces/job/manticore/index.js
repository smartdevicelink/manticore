const builder = require('nomad-helper');
const http = require('async-request');
const config = require('./config');
const settings = require('./image-settings');
const loggerModule = process.env.MODULE_LOGGER || 'winston';
const logger = require(`../../logger/${loggerModule}`);
const utils = require('../../../utils.js'); //contains useful functions for the job submission process

//times to wait for healthy instances in milliseconds
const CORE_HEALTH_TIME = 5000;

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

function jobOptions () {
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
function validate (body) {
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
/*
function construct () {
    const job = builder.createJob("core-" + id);
    const groupName = "core-group-" + id;
    const taskName = "core-task-" + id;
    const serviceName = "core-service-" + id;
    job.addGroup(groupName);
    job.setType("batch");
    //set the restart policy of core so that if it dies once, it's gone for good
    //attempts number should be 0. interval and delay don't matter since task is in fail mode
    job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");
    job.addTask(groupName, taskName);
    job.setImage(groupName, taskName, coreImageName);
    job.addPort(groupName, taskName, true, "hmi", 9000);
    job.addPort(groupName, taskName, true, "tcp", 12345);
    job.addPort(groupName, taskName, true, "file", 3001);
    job.addPort(groupName, taskName, true, "log", 8888);
    job.addEnv(groupName, taskName, "DOCKER_IP", "${NOMAD_IP_hmi}");
    job.addConstraint({
        LTarget: "${meta.core}",
        Operand: "=",
        RTarget: "1"
    }, groupName);
    //set resource limitations
    job.setCPU(groupName, taskName, 100);
    job.setMemory(groupName, taskName, 200);
    job.setMbits(groupName, taskName, 2);
    job.setEphemeralDisk(groupName, 500, false, false);
    job.setLogs(groupName, taskName, 2, 25);
    job.addService(groupName, taskName, serviceName);
    job.setPortLabel(groupName, taskName, serviceName, "hmi");
    
        var groupName = strings.hmiGroupPrefix + request.id;
        job.addGroup(groupName);
        job.setType("service");
        var taskName = strings.hmiTaskPrefix + request.id;
        job.addTask(groupName, taskName);
        job.setImage(groupName, taskName, hmiImageName);
        job.addPort(groupName, taskName, true, "user", 8080);
        job.addConstraint({
            LTarget: "${meta.core}",
            Operand: "=",
            RTarget: "1"
        }, groupName);
        //set resource limitations
        job.setCPU(groupName, taskName, 40);
        job.setMemory(groupName, taskName, 75);
        job.setMbits(groupName, taskName, 1);
        job.setEphemeralDisk(groupName, 30, false, false);
        job.setLogs(groupName, taskName, 1, 10);
        job.addEnv(groupName, taskName, "HMI_TO_BROKER_ADDR", fullAddressBroker);
        job.addEnv(groupName, taskName, "BROKER_TO_CORE_FILE_ADDR", core.Address + ":" + coreFilePort);

        var serviceName = strings.hmiServicePrefix + request.id;
        job.addService(groupName, taskName, serviceName);
        job.setPortLabel(groupName, taskName, serviceName, "user");
        //add a health check
        var healthObj = {
            Type: "http",
            Name: strings.hmiAliveHealth,
            Interval: 3000000000, //in nanoseconds
            Timeout: 2000000000, //in nanoseconds
            Path: "/",
            Protocol: "http"
        }
        job.addCheck(groupName, taskName, serviceName, healthObj);
    
}
*/
async function getRunningJobs () {
    const result = await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/jobs?prefix=core-hmi-`);
    const jobInfo = await parseJson(result.body);
    
}

//responsible for advancing the state of the job for a request
//can modify the context object passed in from manticore
async function advance (ctx) {
    //note: modify nextRequest as a shortcut to modifying waitingState
    const {nextRequest, waitingState} = ctx;
    const {id, request} = nextRequest;
    const {version, build} = request.core;

    const jobName = "core-hmi-" + id;
    const serviceName = "core-service-" + id;

    //perform a different action depending on the current state
    if (nextRequest.state === "waiting") { //this stage causes a core job to run
        const jobFile = settings.generateCoreJobFile(jobName, nextRequest);
        const imageInfo = settings.configurationToImageInfo(version, build, id);

        //submit the job and wait for results. ctx may be modified
        const successJob = await utils.autoHandleJob(ctx, jobName, jobFile.Job);
        if (!successJob) return; //failed job submission. bail out
        logger.debug("Allocation successful for: " + id);

        //the job is running at this point. check on all the services attached to the job. ctx may be modified
        const serviceNames = imageInfo.services.map(service => {
            return service.name;
        });
        const successServices = await utils.autoHandleServices(ctx, serviceNames, CORE_HEALTH_TIME);
        if (!successServices) return; //failed service check. bail out
        logger.debug("Services healthy for: " + id);

        //services are healthy. update the store's remote state
        ctx.updateStore = true;
        return ctx.nextRequest.state = "pending-1";
    }
    if (nextRequest.state === "pending-1") { //this stage causes an hmi to run
        //TODO: submit the HMI here! get the allocation info from core, too. store it using the previous state?
        return ctx.nextRequest.state = "claimed";
    }

}

//job-related helper functions

//helper function for converting strings to JSON
async function parseJson (string) {
    try {
        return JSON.parse(string);
    } catch (err) { //invalid JSON here. initialize to empty object
        logger.error(new Error("Invalid JSON string: " + string).stack);
        return {};
    }
}

module.exports = {
    jobOptions: jobOptions,
    validate: validate,
    advance: advance
}

//utility module for easy interfacing with Nomad and Consul and for other functions
//warning: dont require config. config requires the job module, which requires this module
const loggerModule = process.env.MODULE_LOGGER || 'winston';
const logger = require(`./interfaces/logger/${loggerModule}`);
const config = {
	clientAgentIp: process.env.NOMAD_IP_http || 'localhost',
	nomadAgentPort: process.env.NOMAD_AGENT_PORT || 4646,
	consulAgentPort: process.env.CONSUL_AGENT_PORT || 8500
};
const http = require('async-request');
//failure types
const FAILURE_TYPE_PERMANENT = "PERMANENT";
const FAILURE_TYPE_PENDING = "PENDING";
const FAILURE_TYPE_RESTART = "RESTART";

//TODO: how to handle the case where we're looking at a PREVIOUS job's status?
//	ex. kill a job so that it's dead. It will show the dead state. that alloc is never returned because 
//  the job stays dead forever? manually stop the job and try running Manticore again. 
//TODO: how to handle the case where we're looking at a PREVIOUS consul services's status?
//TODO: add a meta tag to nomad adding some timestamp and checking if it's the same? just do that here?
//TODO: what about for each service? 
//TODO: how to get around the circular dependency problems?
//TODO: what happens if there are no health checks at all?
//TODO: watchAllocationToResolution incomplete. check there for TODOs


//a well-rounded implementation of handling a job submission and dealing with possible errors
//this modifies ctx so the caller function can see what the suggested action is
//returns whether the job is submitted without errors
async function autoHandleJob (ctx, jobName, jobFile) {
	//perform a job CAS
    const jobSetter = await casJob(jobName);
    await jobSetter.set(jobFile); //submit the job
    //retrieve the allocation information of the job
    const alloc = await watchAllocationToResolution(jobName);

    //the job has to be running at this point, or else this should be considered a failure
    if (alloc.ClientStatus !== "running") { 
        logger.error(`Core allocation failed for user ${ctx.nextRequest.id}!`);
        await logAllocationError(alloc); //log the error information

        const failureType = determineAllocationFailureType(alloc);
        if (failureType === FAILURE_TYPE_PERMANENT) { //boot the user off the store
            ctx.updateStore = true;
            ctx.removeUser = true;
        }
        if (failureType === FAILURE_TYPE_PENDING) { //do not modify the state
            ctx.updateStore = false;
        }
        if (failureType === FAILURE_TYPE_RESTART) { //put the user's state back in waiting
            ctx.updateStore = true;
            ctx.nextRequest.state = "waiting";
        }
        return false;
    }
    return true;
}

//continuously hit the allocations endpoint until a non-pending, non-complete status is found
async function watchAllocationToResolution (jobName, wait, index) {
    let baseUrl = `http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${jobName}/allocations?`;
    if (index !== undefined) {
        baseUrl = `${baseUrl}index=${index}&`; //long poll for any updates
    }
    if (wait !== undefined) {
        baseUrl = `${baseUrl}wait=${wait}s`;
    }
    const response = await http(baseUrl); //get allocation info about the job
    const newIndex = response.headers["x-nomad-index"]; 
    const allocs = await parseJson(response.body);
    //TODO: found a case where allocs[0] isn't the most recent status. figure that out!

    //get the newest status of the allocation, if there is any. 
    if (allocs.length === 0 || allocs[0].ClientStatus === "pending" || allocs[0].ClientStatus === "complete") { 
        //start over and wait for more updates
        return await watchAllocationToResolution(jobName, wait, newIndex);
    }
    else { //a non-pending state is found. return the allocation info for further evaluation
        return allocs[0];
    }
}

async function logAllocationError (allocation) {
    logger.error(`Allocation error details for job ${allocation.JobID}, task group ${allocation.TaskGroup}:`);
    logger.error(`Final status: ${allocation.ClientStatus}`);
    for (let taskName in allocation.TaskStates) {
        logger.error(`Task history for ${taskName}:`);
        allocation.TaskStates[taskName].Events.forEach(event => {
            logger.error(event.DisplayMessage);
        });
    }
}

/*
	given an erroneous allocation, figure out what type of error it is and return a suggested action 
	different errors necessitate different actions
	Errors like driver errors are not recoverable, so boot the user off the waiting list. (Permanent Failure)
	Errors like lack of resources on the machines just need time, so don't update the user's state. (Pending Failure)
	Errors like the allocation being lost requires a restart in the process, so reset to waiting. (Restart Failure)
	When unsure, use Permanent Failure. It's too risky for the other two options to happen if unsure
	(ex. possible infinite loop for a Restart Failure, possible deadlock for a Pending Failure)
	returns one of the following strings: "PERMANENT", "PENDING", "RESTART"
*/
function determineAllocationFailureType (allocation) {
    return FAILURE_TYPE_PERMANENT;
}

async function getJob (key) {
    return await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${key}`);
}

async function setJob (key, opts) {
    return await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${key}`, {
        method: 'POST',
        data: JSON.stringify(opts)
    });
}

//check and set implementation. return the value and a set function that allows safe updating of the value
async function casJob (key) {
    const result = await getJob(key);
    //if no result, casIndex should be 0 to signify a new entry where the key is
    const job = await parseJson(result.body); //note: could just be the text "job not found" returned from Nomad's API
    const casIndex = (job && job.JobModifyIndex) ? job.JobModifyIndex : 0;
    return {
        value: job,
        //provide a function to set the new value in a concurrency-friendly manner
        set: async newJob => {
            //if the index has changed in the remote, this set will fail. this means
            //that another server submitted the same change first
            return await setJob(key, {
                Job: newJob,
                EnforceIndex: true,
                JobModifyIndex: casIndex
            });
        }
    }
}

//a well-rounded implementation of handling service health checks and dealing with possible errors
//this modifies ctx so the caller function can see what the suggested action is
//returns whether the services are running without errors
async function autoHandleServices (ctx, serviceNames, healthTime = 5000) {
	const serviceWatches = serviceNames.map(name => {
        //run synchronously to prevent blocking. force a result by healthTime milliseconds
        return watchServiceToResolution(name, Date.now() + healthTime); 
    });
    const services = await Promise.all(serviceWatches); //wait for resolution on all watches

    //all statuses must be passing at this point, or else this should be considered a failure
    let servicesPassing = true;
    services.forEach(service => {
        if (service === null || service.Status !== "passing") 
            servicesPassing = false;
    });
    if (!servicesPassing) { 
        logger.error(`Core health checks failed for user ${ctx.nextRequest.id}!`);
        await logServicesError(services); //log the error information

        const failureType = determineServiceFailureType(services);
        if (failureType === FAILURE_TYPE_PERMANENT) { //boot the user off the store
            ctx.updateStore = true;
            ctx.removeUser = true;
        }
        if (failureType === FAILURE_TYPE_PENDING) { //do not modify the state
            return ctx.updateStore = false;
        }
        if (failureType === FAILURE_TYPE_RESTART) { //put the user's state back in waiting
            ctx.updateStore = true;
            return ctx.nextRequest.state = "waiting";
        }
        return false;
    }
    return true;
}

/*
    The service starts off on critical and stays there until the check passes
    Since it can start off on a non-pending state automatically, a different tactic is needed to determine
    resolution. Just wait for the service to enter a passing state. Force an end after a set amount of time.
    The Status property will be useful, as it represents the state using ALL checks. 

    This issue best reflects a concern to change this behavior:
    https://github.com/hashicorp/consul/issues/2314
*/

//continuously hit the health checks endpoint until either the end date is passed or until the status is passing
async function watchServiceToResolution (serviceName, endDate = 0, index) {
    let baseUrl = `http://${config.clientAgentIp}:${config.consulAgentPort}/v1/health/checks/${serviceName}?`;
    if (index !== undefined) {
        baseUrl = `${baseUrl}index=${index}&`;
    }
    //generate a wait parameter based on the current date and endDate
    let waitTimeLeft = endDate - Date.now();
    waitTimeLeft = Math.max(0, waitTimeLeft); //cap the minimum time to zero
    waitTimeLeft = Math.ceil(waitTimeLeft / 1000); //the time left between now and endDate into seconds, rounded up

    baseUrl = `${baseUrl}wait=${waitTimeLeft}s`;

    const response = await http(baseUrl); //get info about all the health checks from this service
    const newIndex = response.headers["x-consul-index"];
    const services = await parseJson(response.body);
    //a max of one service should ever be returned
    const service = services.length !== 0 ? services[0] : null;
    //check if the current date is larger than the specified end date
    if (Date.now() > endDate) { //out of time. do not continue watching
        return service;
    }

    if (!service || service.Status !== "passing") { //start over and wait for more updates
        return await watchServiceToResolution(serviceName, endDate, newIndex);
    }
    else { //a passing state is found. return the service info for further evaluation
        return service;
    }
}

//see determineAllocationFailureType for details
function determineServiceFailureType (services) {
    return FAILURE_TYPE_PERMANENT;
}

async function logServicesError (services) {
    logger.error(`Services report:`);
    services.forEach(service => {
        logger.error(`-----`);
        if (!service) {
			return logger.error("unknown service");
        }
        logger.error(`Name: ${service.ServiceName}`);
        logger.error(`Status: ${service.Status}`);
        logger.error(`Details: ${service.Output}`);
    });
}

//helper function for converting strings to JSON
async function parseJson (string) {
    try {
        return JSON.parse(string);
    } catch (err) { //invalid JSON here. initialize to empty object
        return {};
    }
}

module.exports = {
	//job automation
	autoHandleJob: autoHandleJob,
	watchAllocationToResolution: watchAllocationToResolution,
	logAllocationError: logAllocationError,
	determineAllocationFailureType: determineAllocationFailureType,
	//getting and setting job info
	getJob: getJob,
	setJob: setJob,
	casJob: casJob,
	//service check automation
	autoHandleServices: autoHandleServices,
	watchServiceToResolution: watchServiceToResolution,
	logServicesError: logServicesError,
	determineServiceFailureType: determineServiceFailureType,
	//miscellaneous
	parseJson: parseJson,
	FAILURE_TYPE_PERMANENT: FAILURE_TYPE_PERMANENT,
	FAILURE_TYPE_PENDING: FAILURE_TYPE_PENDING,
	FAILURE_TYPE_RESTART: FAILURE_TYPE_RESTART,
}
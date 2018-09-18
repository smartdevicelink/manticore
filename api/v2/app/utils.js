// Copyright (c) 2018, Livio, Inc.
//utility module for easy interfacing with Nomad and Consul and for other functions
const config = require('./config.js');
const logger = config.logger;
const http = require('async-request');

//failure types
const FAILURE_TYPE_PERMANENT = "PERMANENT";
const FAILURE_TYPE_PENDING = "PENDING";
const FAILURE_TYPE_RESTART = "RESTART";

/*
    watchAllocationsToResolution and watchServicesToResolution only check until the job and services are healthy. 
    This means that they don't check for the case where an already healthy job/service becomes unhealthy.
    
    watchAllocationsToResolution and watchServicesToResolution both use a forced end date and will not stop early
    unless a successful result is returned. watchAllocationsToResolution could stop early when a dead/failed state
    is found since its starting state is pending, unlike with watching a service where it starts in a failed state. 
    However, there could be a case where an allocation is in a non-pending, non-running state when read and it is simply
    in transition to a pending or running state. Waiting for a running state seems like the better option of the two.
    The intent is to have a job in the running state so Manticore should be biased towards waiting for a running state
    and face the possibility of the running state being an outdated value on read. The services check can confirm 
    or deny whether the allocation is indeed healthy later
*/

//handles every part of a job submission and services check. returns whether the process was a success
async function autoHandleAll (config) {
    const {ctx, job, taskNames, allocationTime, services, healthTime, stateChangeValue, servicesKey} = config;
    const jobName = job.Name;
    const id = ctx.currentRequest.id;

    //submit the job and wait for results. ctx may be modified
    const successJob = await autoHandleJob(ctx, jobName, job, taskNames, allocationTime);
    if (!successJob) return false; //failed job submission. bail out
    logger.debug("Allocation successful for: " + id);

    //the job is running at this point. do a health check on all the services attached to the job. ctx may be modified
    //ignore all services with no checks property for checkedServiceNames
    const getNameFunc = elem => elem.name;
    const allServiceNames = services.map(getNameFunc);
    const checkedServiceNames = services.filter(service => {
        return service.checks && service.checks.length > 0;
    }).map(getNameFunc);

    const successServices = await autoHandleServices(ctx, checkedServiceNames, healthTime);
    if (!successServices) return false; //failed service check. bail out

    //get a map of all service names to real addresses to the services. store them in the store

    let serviceInfo;

    try { //could get an error regarding the address lookup failing
        serviceInfo = await findServiceAddresses(allServiceNames);
    }
    catch (err) { //fail out
        logger.error(new Error(err).stack);
        ctx.updateStore = true;
        ctx.removeUser = true;
        return false;
    }
    logger.debug("Services healthy for: " + id);

    if (!ctx.currentRequest.services) {
        ctx.currentRequest.services = {};
    }
    //use servicesKey to attach address info in a property of the request's services object
    ctx.currentRequest.services[servicesKey] = serviceInfo;

    //services are healthy. update the store's remote state
    ctx.updateStore = true;
    ctx.currentRequest.state = stateChangeValue;
    return true;
}


//a well-rounded implementation of handling a job submission and dealing with possible errors
//this modifies ctx so the caller function can see what the suggested action is
//returns whether the job is submitted without errors
async function autoHandleJob (ctx, jobName, jobFile, taskNames, healthTime = 10000) {
    //perform a job CAS
    const jobSetter = await casJob(jobName);
    const jobResult = await jobSetter.set(jobFile); //submit the job
    const parsedResult = await parseJson(jobResult.body);

    //retrieve the allocation information of the job. force a result by healthTime milliseconds
    const allocs = await watchAllocationsToResolution(jobName, taskNames, Date.now() + healthTime);

    //get the evaluation after the allocation has come to a resolution, or else the data will be outdated
    const evals = await getEvals(jobName);

    if (evals.length === 0) { //no evaluations for the job found! this is an error
        logger.error(new Error("Evaluation not found for job " + jobName).stack);
        handleFailureType(ctx, FAILURE_TYPE_PERMANENT); //boot the user off the store
        return false;
    }

    //the job has to be running at this point, or else this should be considered a failure
    if (!await allocationsHealthCheck(allocs, taskNames)) { 
        logger.error(`Allocation failed for user ${ctx.currentRequest.id}!`);
        await logAllocationsError(allocs, evals); //log the error information

        const failureType = await determineAllocationsFailureType(allocs, evals);
        handleFailureType(ctx, failureType); //manage the failure here
        return false;
    }
    return true;
}

//continuously hit the allocations endpoint until either the end date is passed or until the status is running
async function watchAllocationsToResolution (jobName, taskNames, endDate, index) {
    let baseUrl = `http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${jobName}/allocations?`;
    if (index !== undefined) {
        baseUrl = `${baseUrl}index=${index}&`; //long poll for any updates
    }
    //generate a wait parameter based on the current date and endDate
    let waitTimeLeft = endDate - Date.now();
    waitTimeLeft = Math.max(0, waitTimeLeft); //cap the minimum time to zero
    waitTimeLeft = Math.ceil(waitTimeLeft / 1000); //the time left between now and endDate into seconds, rounded up
    
    baseUrl = `${baseUrl}wait=${waitTimeLeft}s`;

    const response = await http(baseUrl); //get allocation info about the job
    const newIndex = response.headers["x-nomad-index"]; 
    const allocs = await parseJson(response.body);

    const filteredAllocs = await getLatestAllocations(allocs);

    //check if the current date is larger than the specified end date
    if (Date.now() > endDate) { //out of time. do not continue watching
        return filteredAllocs;
    }

    if (!await allocationsHealthCheck(filteredAllocs, taskNames)) {
        //start over and wait for more updates
        return await watchAllocationsToResolution(jobName, taskNames, endDate, newIndex);
    }
    else { //a running state is found. return the allocations for further evaluation
        return filteredAllocs;
    }
}

//continuously hit the allocations endpoint until the job is out of the running state
async function watchAllocationsToEnd (jobName, taskNames, index) {
    let baseUrl = `http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${jobName}/allocations?`;
    if (index !== undefined) {
        baseUrl = `${baseUrl}index=${index}&`; //long poll for any updates
    }

    const response = await http(baseUrl); //get allocation info about the job
    const newIndex = response.headers["x-nomad-index"];
    const allocs = await parseJson(response.body);

    const filteredAllocs = await getLatestAllocations(allocs);

    if (!await allocationsHealthCheck(filteredAllocs, taskNames)) { //health check failed
        return filteredAllocs;
    }
    else { //start over and wait for more updates
        return await watchAllocationsToEnd(jobName, taskNames, newIndex);
    }
}

//retrieve all allocations with unique task names with the highest job version number
//be aware of multiple tasks per task group running simultaneously
async function getLatestAllocations (allocs) {
    let uniqueGroupIndeces = {};
    for (let i = 0; i < allocs.length; i++) {
        const {JobVersion, Name} = allocs[i];
        if (!uniqueGroupIndeces[Name] || uniqueGroupIndeces[Name].version < JobVersion) {
            //found a more recent allocation for this task group
            uniqueGroupIndeces[Name] = {
                version: JobVersion,
                index: i
            }
        }
    }
    //get the filtered allocations using the found indeces
    let filteredAllocs = [];
    for (let name in uniqueGroupIndeces) {
        const allocIndex = uniqueGroupIndeces[name].index;
        filteredAllocs.push(allocs[allocIndex]);
    }
    return filteredAllocs;
}

//determine if the job is healthy by inspecting the allocations and running tasks
//use getLatestAllocations before passing allocations here
async function allocationsHealthCheck (allocs, taskNames) {
    let requiredTasksMap = {};
    //populate the task map
    taskNames.forEach(task => {
        requiredTasksMap[task.name] = task.count;
    });

    //check that all filtered allocations are running
    for (let i = 0; i < allocs.length; i++) {
        if (allocs[i].ClientStatus !== "running") return false;
        //find all tasks and update the tasks map accordingly
        for (let taskName in allocs[i].TaskStates) {
            if (requiredTasksMap[taskName] === undefined) return false; //unexpected task running
            requiredTasksMap[taskName]--;
        }
    }

    //requiredTasksMap must have a 0 count in all elements by the time allocs are parsed
    //if not, fail the health check
    for (let taskName in requiredTasksMap) {
        if (requiredTasksMap[taskName] !== 0) return false;
    }
    //pass
    return true;
}

//diagnostics function. use getLatestAllocations before passing allocations here
async function logAllocationsError (allocations, evals) {
    logger.error(`Allocation error report. Number of allocations: ${allocations.length}`);
    for (let i = 0; i < allocations.length; i++) {
        const allocation = allocations[i];
        logger.error(`Details for job ${allocation.JobID}, task group ${allocation.TaskGroup}:`);
        logger.error(`Final status: ${allocation.ClientStatus}`);
        for (let taskName in allocation.TaskStates) {
            logger.error(`Task history for ${taskName}:`);
            allocation.TaskStates[taskName].Events.forEach(event => {
                logger.error(event.DisplayMessage);
            });
        }
    }
    evals.forEach(eval => {
        if (eval.FailedTGAllocs) {
            for (let groupName in eval.FailedTGAllocs) {
                logger.error(`Evaluation error report for task group ${groupName}:`);
                const groupInfo = eval.FailedTGAllocs[groupName];
                logger.error(`Constraint Filters: ${JSON.stringify(groupInfo.ConstraintFiltered)}`);
                const {NodesEvaluated, NodesFiltered, NodesExhausted} = groupInfo;
                logger.error(`Nodes Evaluated/Filtered/Exhausted: ${NodesEvaluated}/${NodesFiltered}/${NodesExhausted}`);

                for (let dimension in groupInfo.DimensionExhausted) {
                    logger.error(`${dimension} has been exhausted!`);
                }
            }
        }        
    });
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
async function determineAllocationsFailureType (allocations, evals) {
    if (allocations.length === 0) { 
        //no allocations were placed. check the evaluation details instead for information
        for (let i = 0; i < evals.length; i++) {
            const eval = evals[i];
            if (eval.FailedTGAllocs !== null && eval.FailedTGAllocs !== undefined ) { 
                return FAILURE_TYPE_PENDING; //some lack of resource has caused the allocation to be unplacable
            }    
        }
    }
    return FAILURE_TYPE_PERMANENT;
}

async function getJob (key) {
    return await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${key}`);
}

async function getEvals (jobName) {
    const result = await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${jobName}/evaluations`);
    const parsedResult = await parseJson(result.body);
    if (parsedResult+'' === '{}') return []; //no evaluations
    return parsedResult;
}

async function setJob (key, opts) {
    return await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${key}`, {
        method: 'POST',
        data: JSON.stringify(opts)
    });
}

async function stopJob (key, purge = false) {
    return await http(`http://${config.clientAgentIp}:${config.nomadAgentPort}/v1/job/${key}?purge=${purge}`, {
        method: 'DELETE'
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
async function autoHandleServices (ctx, serviceNames, healthTime = 10000) {
    const serviceWatches = serviceNames.map(name => {
        //run synchronously to prevent blocking. force a result by healthTime milliseconds
        return watchServicesToResolution(name, Date.now() + healthTime); 
    });
    const services = await Promise.all(serviceWatches); //wait for resolution on all watches

    //all statuses must be passing at this point, or else this should be considered a failure
    //services should be flattened first
    const flattenedServices = services.reduce((arr, serviceArray) => {
        return arr.concat(serviceArray);
    }, []);

    const servicesPassing = await servicesHealthCheck(flattenedServices);
    if (!servicesPassing) { 
        logger.error(`Health checks failed for user ${ctx.currentRequest.id}!`);
        await logServicesError(serviceNames, flattenedServices); //log the error information

        const failureType = await determineServicesFailureType(flattenedServices);
        handleFailureType(ctx, failureType); //manage the failure here
        return false;
    }
    return true;
}

//determine if the services are healthy
async function servicesHealthCheck (services) {
    for (let i = 0; i < services.length; i++) {
        const service = services[i];
        if (service === null || service.Status !== "passing") {
            return false; //fail
        }
    }
    return true; //pass
}

//continuously hit the health checks endpoint until either the end date is passed or until the status is passing
async function watchServicesToResolution (serviceName, endDate = 0, index) {
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
    
    //check if the current date is larger than the specified end date
    if (Date.now() > endDate) { //out of time. do not continue watching
        return services;
    }

    //all services found must be passing
    if (!await servicesHealthCheck(services)) { //start over and wait for more updates
        return await watchServicesToResolution(serviceName, endDate, newIndex);
    }
    else { //a passing state is found. return the service info for further evaluation
        return services;
    }
}

//continuously hit the health checks endpoint until the service no longer passes or isn't checkable
async function watchServiceToEnd (serviceName, index) {
    let baseUrl = `http://${config.clientAgentIp}:${config.consulAgentPort}/v1/health/checks/${serviceName}?`;
    if (index !== undefined) {
        baseUrl = `${baseUrl}index=${index}&`;
    }

    const response = await http(baseUrl); //get info about all the health checks from this service
    const newIndex = response.headers["x-consul-index"];
    const services = await parseJson(response.body);

    //a max of one service should ever be returned
    const service = services.length !== 0 ? services[0] : null;

    if (!service || service.Status !== "passing") { //health check failed
        return service;
    }
    else { //passing state. start over and wait for more updates
        return await watchServiceToEnd(serviceName, newIndex);
    }
}

//for failed services always assume that it's irrecoverable
async function determineServicesFailureType (services) {
    return FAILURE_TYPE_PERMANENT;
}

async function logServicesError (serviceNames, services) {
    logger.error(`Services report:`);
    logger.error(`Services watched: ${serviceNames}`);
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

//given an array of service names, looks them up using consul's API to get the addresses
//creates a map with the service names as keys and the addresses as values

async function findServiceAddresses (serviceNames) {
    let serviceToAddressMap = {};

    const servicesPromises = serviceNames.map(async serviceName => {
        const response = await getService(serviceName);
        const services = await parseJson(response.body);
        return services.forEach((service, index) => {
            serviceToAddressMap[`${serviceName}-${index}`] = {
                internal: `${service.Address}:${service.ServicePort}`
            };
        });
    });

    await Promise.all(servicesPromises); //wait for the promises to build the address map

    return serviceToAddressMap;
}

//queries consul for all nodes that house the running service
async function getService (name) {
    const baseUrl = `http://${config.clientAgentIp}:${config.consulAgentPort}/v1/catalog/service/${name}`;
    return http(baseUrl); 
}

//modifies ctx depending on what error string gets passed in
function handleFailureType (ctx, type) {
    if (type === FAILURE_TYPE_PERMANENT) { //boot the user off the store
        ctx.updateStore = true;
        ctx.removeUser = true;
    }
    if (type === FAILURE_TYPE_PENDING) { //do not modify the state
        ctx.updateStore = false;
    }
    if (type === FAILURE_TYPE_RESTART) { //put the user's state back in waiting
        ctx.updateStore = true;
        ctx.currentRequest.state = "waiting";
    }
}

//given a service object, determine what the correct address should be based on the server's configuration
function formatHttpAddress (serviceObj) {
    //default to internal address
    let address = serviceObj.internal;

    if (config.modes.haproxy) {
        let domainAddress = `${serviceObj.external}.${config.haproxyDomain}`;
        //external address (HAProxy)
        address = `http://${domainAddress}:${config.haproxyPort}`;
        if (config.modes.elb) { //external address (ELB)
            address = `http://${domainAddress}`;
        }
        if (config.modes.elbEncryptHttp) { //secure external address (ELB)
            address = `https://${domainAddress}`;
        }
    }
    return address;
}

//given a service object, determine what the correct address should be based on the server's configuration
function formatWsAddress (serviceObj) {
    //default to internal address
    let address = serviceObj.internal;

    if (config.modes.haproxy) {
        let domainAddress = `${serviceObj.external}.${config.haproxyDomain}`;
        //external address (HAProxy)
        address = `ws://${domainAddress}:${config.haproxyPort}`;
        if (config.modes.elb) { //external address (ELB)
            address = `ws://${domainAddress}`;
        }
        if (config.modes.elbEncryptWs) { //secure external address (ELB)
            address = `wss://${domainAddress}`;
        }
    }
    return address;
}

//given a service object, determine what the correct address should be based on the server's configuration
function formatTcpAddress (serviceObj) {
    //default to internal address
    let address = serviceObj.internal;

    if (config.modes.haproxy) {
        let domainAddress = `${config.haproxyDomain}:${serviceObj.external}`;
        //external address (HAProxy)
        address = `${domainAddress}`;
    }
    return address;
}

module.exports = {
    //master function
    autoHandleAll: autoHandleAll,
    //job/allocation automation
    autoHandleJob: autoHandleJob,
    watchAllocationsToResolution: watchAllocationsToResolution,
    watchAllocationsToEnd: watchAllocationsToEnd,
    getLatestAllocations: getLatestAllocations,
    allocationsHealthCheck: allocationsHealthCheck,
    logAllocationsError: logAllocationsError,
    determineAllocationsFailureType: determineAllocationsFailureType,
    //getting and setting job info
    getJob: getJob,
    getEvals: getEvals,
    setJob: setJob,
    casJob: casJob,
    stopJob: stopJob,
    //service check automation
    autoHandleServices: autoHandleServices,
    servicesHealthCheck: servicesHealthCheck,
    watchServicesToResolution: watchServicesToResolution,
    watchServiceToEnd: watchServiceToEnd,
    logServicesError: logServicesError,
    determineServicesFailureType: determineServicesFailureType,
    //miscellaneous
    parseJson: parseJson,
    FAILURE_TYPE_PERMANENT: FAILURE_TYPE_PERMANENT,
    FAILURE_TYPE_PENDING: FAILURE_TYPE_PENDING,
    FAILURE_TYPE_RESTART: FAILURE_TYPE_RESTART,
    findServiceAddresses: findServiceAddresses,
    handleFailureType: handleFailureType,
    formatHttpAddress: formatHttpAddress,
    formatWsAddress: formatWsAddress,
    formatTcpAddress: formatTcpAddress
}
const utils = require('../../utils.js');
const config = require('../../config.js');
const parent = require('../../index.js');
const {store, job, logger} = config;

//module that monitors jobs after they are successful and continues checking for their health
//if an unhealthy service is found or if the allocation gets disrupted this will tear down the job

//these hold maps of promises
let allocationWatches = {}; //map of allocation watches, where the key is the id
let serviceWatches = {}; //map of service watches, where the key is the service name

module.exports = {
    "post-waiting-job-advance": async (ctx, next) => {
        //find all requests in the claimed state first
        const claimedRequests = [];
        for (let id in ctx.waitingState) {
            if (ctx.waitingState[id].state === "claimed") {
                claimedRequests.push(ctx.waitingState[id]);
            }
        }

        //parse through all claimed requests
        claimedRequests.forEach(async request => {
            //use the id to find the job and task names, then watch the job's status
            const id = request.id;
            const jobName = await job.idToJobName(id);
            const taskNames = await job.idToTaskNames(id);
            //allocation watch
            if (!allocationWatches[id]) { //dont allow duplicate watches
                allocationWatches[id] = utils.watchAllocationsToEnd(jobName, taskNames)
                    .then(allocationResolve(id)); //invoked when the job stops running
            }
            //services watch
            for (let category in request.services) {
                for (let serviceName in request.services[category]) {
                    if (!serviceWatches[serviceName]) { //dont allow duplicate watches
                        serviceWatches[id] = utils.watchServiceToEnd(serviceName)
                            .then(serviceResolve(id, serviceName)); 
                        //"then" is invoked when the service isn't passing or isn't checkable
                    }
                }
            }
        });

        next();
    }
}

function allocationResolve (id) {
    return async function (filteredAllocs) {
        //TODO: determine whether the allocation stopped due to expected reasons or unexpected reasons
        //TODO: log all unexpected reasons as errors. expected reasons include a user stopping a job manually
        //TODO: use utils.determineAllocationsFailureType or do something else for figuring out the stop reason?
        //remove the user from the request list
        await parent.deleteRequest(id);
        logger.debug(`Stop watching allocation status of id ${id}`);
        //remove the watch from the hash
        delete allocationWatches[id];
    }
}

function serviceResolve (id, serviceName) {
    return async function (service) {
        //ignore the service if null is returned. it is likely just not a health checkable service
        if (!service) { //remove the watch from the hash
            return delete serviceWatches[serviceName];
        }
        //at this point we know that the service is not passing
        logger.error(`Failure found with service ${serviceName}`);
        //remove the user from the request list
        await parent.deleteRequest(id);
        //remove the watch from the hash
        delete serviceWatches[serviceName];
    }    
}
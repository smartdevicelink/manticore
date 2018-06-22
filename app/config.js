const storeModule = process.env.MODULE_STORE || 'consul-kv';
const servicesModule = process.env.MODULE_SERVICES || 'consul-services';
const jobModule = process.env.MODULE_JOB || 'manticore';
const loggerModule = process.env.MODULE_LOGGER || 'winston';

const config = {
    //interfaces
    store: require(`./interfaces/store/${storeModule}`),
    services: require(`./interfaces/services/${servicesModule}`),
    job: require(`./interfaces/job/${jobModule}`),
    logger: require(`./interfaces/logger/${loggerModule}`),
    //manticore functionality settings
    //enables usage of json web tokens as the form of unique identification
    jwtSecret: process.env.JWT_SECRET,
    //how much time to wait for the job module to complete a full submission before failing
    jobTimeoutSeconds: process.env.JOB_TIMEOUT_SECONDS || 10
};


module.exports = config;
module.exports = {
    //interfaces
    state: process.env.V2_MODULE_STATE || 'consul-kv',
    services: process.env.V2_MODULE_SERVICES || 'consul-services',
    job: process.env.V2_MODULE_JOB || 'manticore',
    logger: process.env.V2_MODULE_LOGGER || 'winston',
    //manticore functionality settings
    //enables usage of json web tokens as the form of unique identification
    jwtSecret: process.env.V2_JWT_SECRET
}

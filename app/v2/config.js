module.exports = {
    //interfaces
    state: process.env.V2_MODULE_STATE || 'consul-kv',
    services: process.env.V2_MODULE_SERVICES || 'consul-services',
    job: process.env.V2_MODULE_JOB || 'manticore',
    logger: process.env.V2_MODULE_LOGGER || 'winston'
}

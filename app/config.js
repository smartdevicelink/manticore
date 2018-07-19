const storeModule = process.env.MODULE_STORE || 'consul-kv';
const jobModule = process.env.MODULE_JOB || 'manticore';
const loggerModule = process.env.MODULE_LOGGER || 'winston';

const config = {
    //interfaces
    logger: require(`./interfaces/logger/${loggerModule}`),
    store: require(`./interfaces/store/${storeModule}`),
    job: require(`./interfaces/job/${jobModule}`),
    //manticore functionality settings
    //enables usage of json web tokens as the form of unique identification
    jwtSecret: process.env.JWT_SECRET,
    //the address of the nomad and consul client. assumes manticore is launched by nomad
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost', 
    nomadAgentPort: process.env.NOMAD_AGENT_PORT || 4646, //the port the nomad agent listens on
    consulAgentPort: process.env.CONSUL_AGENT_PORT || 8500, //the port the consul agent listens on
};


module.exports = config;
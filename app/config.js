const config = {
    //manticore functionality settings
    //enables usage of json web tokens as the form of unique identification
    jwtSecret: process.env.JWT_SECRET,
    //the address of the nomad and consul client. assumes manticore is launched by nomad
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost', 
    nomadAgentPort: process.env.NOMAD_AGENT_PORT || 4646, //the port the nomad agent listens on
    consulAgentPort: process.env.CONSUL_AGENT_PORT || 8500, //the port the consul agent listens on
    consulDnsPort: process.env.CONSUL_DNS_PORT || 8600, //the port the consul DNS server listens on
    logLevel: process.env.LOG_LEVEL || 'debug', //the logging level of manticore to stdout
};

//for dealing with circular dependency issues
module.exports = config;

//interfaces
const storeModule = process.env.MODULE_STORE || 'consul-kv';
const jobModule = process.env.MODULE_JOB || 'manticore';
const loggerModule = process.env.MODULE_LOGGER || 'winston';

config.logger = require(`./interfaces/logger/${loggerModule}`);
config.store = require(`./interfaces/store/${storeModule}`);
config.job = require(`./interfaces/job/${jobModule}`);
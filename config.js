//the master config of which all other config files get their data from
const config = {
    //the port that the web server binds to
    httpPort: process.env.HTTP_PORT || 4000,
    //enables usage of json web tokens as the form of unique identification
    jwtSecret: process.env.JWT_SECRET,
    //the address of the nomad and consul client. assumes manticore is launched by nomad
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost', 
    nomadAgentPort: process.env.NOMAD_AGENT_PORT || 4646, //the port the nomad agent listens on
    consulAgentPort: process.env.CONSUL_AGENT_PORT || 8500, //the port the consul agent listens on
    consulDnsPort: process.env.CONSUL_DNS_PORT || 8600, //the port the consul DNS server listens on
    logLevel: process.env.LOG_LEVEL || 'debug', //the logging level of manticore to stdout
    //the folder under /api to load from. only one version is allowed to run at a time
    apiVersion: process.env.API_VERSION || 'v2',
    haproxyPort: process.env.HAPROXY_HTTP_PORT, //the port haproxy listens on for http traffic
    //reserved properties for manticore's use 
    logger: null,
	store: null,
    job: null,
	websocket: null,
};


module.exports = config;
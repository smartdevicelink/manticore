//the master config of which all other config files get their data from
const config = {
    //USER CONFIGURABLE PROPERTIES

    //the port that the web server binds to
    httpPort: process.env.HTTP_PORT || 4000,
    //enables usage of json web tokens as the form of unique identification
    jwtSecret: process.env.JWT_SECRET,
    //the address of the nomad and consul client. assumes manticore is launched by nomad
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost',
    nomadAgentPort: process.env.NOMAD_AGENT_PORT || 4646, //the port the nomad agent listens on
    consulAgentPort: process.env.CONSUL_AGENT_PORT || 8500, //the port the consul agent listens on
    logLevel: process.env.LOG_LEVEL || 'debug', //the logging level of manticore to stdout
    //the folder under /api to load from. only one version is allowed to run at a time
    apiVersion: process.env.API_VERSION || 'v2',
    haproxyPort: process.env.HAPROXY_HTTP_PORT, //the port haproxy listens on for http traffic
    haproxyDomain: process.env.DOMAIN_NAME, //the domain under which clients will connect to the server
    tcpPortStart: process.env.TCP_PORT_RANGE_START, //the smallest port haproxy can bind to for tcp
    tcpPortEnd: process.env.TCP_PORT_RANGE_END, //the largest port haproxy can bind to for tcp
    //reserved properties for manticore's use
    //how long a user is allowed to use the Manticore service uninterrupted (in seconds)
    usageDuration: process.env.USAGE_DURATION,
    //how long a user has after being warned to send a websocket message to Manticore before being booted
    //off the instance (in seconds). The total time a user has to use Manticore while idling is therefore
    //usageDuration + warningDuration
    warningDuration: process.env.WARNING_DURATION,
    //whether a client can send a websocket message to reset the amount of time before a user is removed
    //from Manticore. Enable this if you want to enforce a max limit of how long a user can use their jobs
    resetTimerAllowed: process.env.RESET_TIMER_ALLOWED,
    //whether the simple Manticore webpage will be served
    webpageDisabled: process.env.WEBPAGE_DISABLED || false,
    awsRegion: process.env.AWS_REGION, //the region Manticore is running on in AWS
    //the security group ID that will allow access to Manticore's internal network
    awsHaproxyGroupId: process.env.AWS_HAPROXY_GROUP_ID,
    elbName: process.env.ELB_MANTICORE_NAME, //name of the AWS ELB
    sslCertificateArn: process.env.SSL_CERTIFICATE_ARN, //SSL certificate attached to the AWS ELB
    sslPort: process.env.ELB_SSL_PORT, //SSL port for secure TCP connections

    awsRegion: process.env.AWS_REGION,
    namespace: process.env.CLOUD_WATCH_NAMESPACE,

    //RESERVED PROPERTIES FOR MANTICORE'S USE

    //manticore interface modules
    logger: null,
	store: null,
    job: null,
	websocket: null,

    //manticore modes and whether they're enabled
    modes: {
        haproxy: false,
        inactivityTimer: false,
        jwt: false,
        aws: false,
        awsSecurityGroup: false,
        elb: false,
    }
};

//provide properties to easily determine whether certain modes of manticore are enabled

if (config.haproxyPort !== undefined
    && config.haproxyDomain !== undefined
    && config.tcpPortStart !== undefined
    && config.tcpPortEnd !== undefined) {
    config.modes.haproxy = true;
}
if (config.usageDuration !== undefined
    && config.warningDuration !== undefined
    && config.resetTimerAllowed !== undefined) {
    config.modes.inactivityTimer = true;
}
if (config.jwtSecret !== undefined) {
    config.modes.jwtEnabled = true;
}

if (config.awsRegion !== undefined) {
    config.modes.aws = true;

    if (config.modes.haproxy
        && config.awsHaproxyGroupId !== undefined) {
        config.modes.awsSecurityGroup = true;
    }

    if (config.modes.haproxy
        && config.elbName !== undefined
        && config.sslPort !== undefined
        && config.sslCertificateArn !== undefined) {
        config.modes.elb = true;
    }
}

//convert strings to booleans for certain properties
if (config.resetTimerAllowed === "false") {
    config.resetTimerAllowed = false;
}
if (config.resetTimerAllowed === "true") {
    config.resetTimerAllowed = true;
}
if (config.webpageDisabled === "false") {
    config.webpageDisabled = false;
}
if (config.webpageDisabled === "true") {
    config.webpageDisabled = true;
}

//convert strings to numbers for certain properties
if (config.httpPort !== undefined) {
    config.httpPort = Number(config.httpPort);
}
if (config.nomadAgentPort !== undefined) {
    config.nomadAgentPort = Number(config.nomadAgentPort);
}
if (config.consulAgentPort !== undefined) {
    config.consulAgentPort = Number(config.consulAgentPort);
}
if (config.tcpPortStart !== undefined) {
    config.tcpPortStart = Number(config.tcpPortStart);
}
if (config.tcpPortEnd !== undefined) {
    config.tcpPortEnd = Number(config.tcpPortEnd);
}
if (config.sslPort !== undefined) {
    config.sslPort = Number(config.sslPort);
}

module.exports = config;

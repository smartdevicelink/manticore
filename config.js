/*
 * Copyright (c) 2018 Livio, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the
 * distribution.
 *
 * Neither the name of the Livio Inc. nor the names of its contributors
 * may be used to endorse or promote products derived from this software
 * without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

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
    //the security group ID that will allow access through Manticore's external load balancer
    awsElbGroupId: process.env.AWS_ELB_GROUP_ID,
    elbName: process.env.ELB_MANTICORE_NAME, //name of the AWS ELB
    elbEncryptHttp: process.env.ELB_ENCRYPT_HTTP, //whether to encrypt HTTP traffic to jobs and to the server
    elbEncryptWs: process.env.ELB_ENCRYPT_WS, //whether to encrypt WS traffic to the server
    elbEncryptTcp: process.env.ELB_ENCRYPT_TCP, //whether to encrypt TCP traffic to jobs
    sslCertificateArn: process.env.SSL_CERTIFICATE_ARN, //SSL certificate attached to the AWS ELB
    wsPort: process.env.ELB_WS_PORT, //WS port for TCP connections

    //TODO: UNUSED
    namespace: process.env.CLOUD_WATCH_NAMESPACE,

    cors: process.env.CORS,
    allowedIpv6: process.env.ALLOWED_IPV6, //the address which is allowed to make requests to manticore
    //the amount of time in seconds between health evaluations
    healthCheckPeriod: process.env.HEALTH_CHECK_PERIOD, 

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
        elbEncryptHttp: false,
        elbEncryptWs: false,
        elbEncryptTcp: false,
        healthCheck: false
    }
};

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
if (config.elbEncryptHttp === "false") {
    config.elbEncryptHttp = false;
}
if (config.elbEncryptHttp === "true") {
    config.elbEncryptHttp = true;
}
if (config.elbEncryptWs === "false") {
    config.elbEncryptWs = false;
}
if (config.elbEncryptWs === "true") {
    config.elbEncryptWs = true;
}
if (config.elbEncryptTcp === "false") {
    config.elbEncryptTcp = false;
}
if (config.elbEncryptTcp === "true") {
    config.elbEncryptTcp = true;
}
if (config.cors === "false") {
    config.cors = false;
}
if (config.cors === "true") {
    config.cors = true;
}

//convert strings to numbers for certain properties
if (config.httpPort !== undefined) {
    config.httpPort = Number(config.httpPort);
}
if (config.haproxyPort !== undefined) {
    config.haproxyPort = Number(config.haproxyPort);
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
if (config.wsPort !== undefined) {
    config.wsPort = Number(config.wsPort);
}
if (config.healthCheckPeriod !== undefined) {
    config.healthCheckPeriod = Number(config.healthCheckPeriod);
}

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
    config.modes.jwt = true;
}

if (config.awsRegion !== undefined) {
    config.modes.aws = true;

    if (config.modes.haproxy
        && config.elbName !== undefined
        && config.wsPort !== undefined) {
        config.modes.elb = true;
    }

    if (config.modes.haproxy
        && config.modes.elb
        && config.awsHaproxyGroupId !== undefined
        && config.awsElbGroupId !== undefined) {
        config.modes.awsSecurityGroup = true;
    }

    //encryption modes
    if (config.modes.haproxy
        && config.modes.elb
        && config.sslCertificateArn !== undefined) {
        if (config.elbEncryptHttp) {
            config.modes.elbEncryptHttp = true;
        }
        if (config.elbEncryptWs) {
            config.modes.elbEncryptWs = true;
        }
        if (config.elbEncryptTcp) {
            config.modes.elbEncryptTcp = true;
        }
    }
}

if (config.healthCheckPeriod !== undefined) {
    config.modes.healthCheck = true;
}


module.exports = config;

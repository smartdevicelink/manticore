// Copyright (c) 2019, Livio, Inc.
const builder = require('nomad-helper');

//a template for constructing core job files easily
function generateJobFile (jobName, body) {
    const {id, request} = body;
    const {version, build} = request.core;

    const info = configurationToImageInfo(version, build, id);
    const resources = info.resources;
    //create a new core job file
    const job = builder.createJob(jobName);
    const groupName = "core-group-" + id;
    const taskName = "core-task-" + id;

    job.addGroup(groupName);
    job.setType("batch");
    //remove Update block since this is a batch job
    delete job.getJob().Job.Update;

    //set the restart policy of core so that if it dies once, it's gone for good
    //attempts number should be 0. interval and delay don't matter since task is in fail mode
    job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");

    job.setCount(groupName, 1);

    job.addTask(groupName, taskName);
    job.setImage(groupName, taskName, info.imageName);
    for (let portName in info.portMaps) {
        job.addPort(groupName, taskName, true, portName, info.portMaps[portName]);
    }
    for (let envName in info.envs) {
        job.addEnv(groupName, taskName, envName, info.envs[envName]);
    }
    job.addConstraint({
        LTarget: "${meta.job}",
        Operand: "=",
        RTarget: "true"
    }, groupName);
    //set resource limitations
    job.setCPU(groupName, taskName, resources.cpu);
    job.setMemory(groupName, taskName, resources.memory);
    job.setMbits(groupName, taskName, resources.mbits);
    job.setEphemeralDisk(groupName, resources.disk, false, false);
    job.setLogs(groupName, taskName, resources.logFiles, resources.logSize);

    //add services and health checks for those services

    info.services.forEach(service => {
        job.addService(groupName, taskName, service.name);
        job.setPortLabel(groupName, taskName, service.name, service.port);
        if (service.checks) {
            service.checks.forEach(check => {
                job.addCheck(groupName, taskName, service.name, check);
            }); 
        }
    });


    return job;
}

//resource settings depending on the core build type
const resourceSettings = {
    default: { //default build resource requirements
        cpu: 120,
        memory: 250,
        mbits: 2,
        disk: 1000,
        logFiles: 2,
        logSize: 20
    }
}

//given a version and build type, find an appropriate core image to use and return info for that configuration
function configurationToImageInfo (coreVersion, coreBuild, id) {
    let imageName = `smartdevicelink/manticore-sdl-core:${coreBuild}-${coreVersion}`;

    return {
        imageName: imageName,
        portMaps: {
            broker: 9000,
            tcp: 12345,
            file: 3001,
            log: 8888,
            policy: 9898,
            wsServer: 2020,
            store: 3000,
            python: 8081
        },
        services: [
            {
                name: `core-broker-${id}`,
                port: "broker",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 3000000000, //3 seconds
                        Timeout: 1000000000, //1 second
                        Protocol: "ws"
                    }
                ]
            },
            {
                name: `core-tcp-${id}`,
                port: "tcp",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 3000000000, //3 seconds
                        Timeout: 1000000000, //1 second
                        Protocol: "tcp"
                    }
                ]
            },
            {
                name: `core-file-${id}`,
                port: "file"
            },
            {
                name: `core-log-${id}`,
                port: "log",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 3000000000, //3 seconds
                        Timeout: 1000000000, //1 second
                        Protocol: "ws"
                    }
                ]
            },
            {
                name: `core-policy-${id}`,
                port: "policy",
                checks: [
                    {
                        Type: "http",
                        Interval: 3000000000, //3 seconds
                        Timeout: 1000000000, //1 second
                        Path: "/",
                        Protocol: "http"
                    }
                ]
            },
            {
                name: `core-ws-server-${id}`,
                port: "wsServer",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 3000000000, //3 seconds
                        Timeout: 1000000000, //1 second
                        Protocol: "ws"
                    }
                ]
            },
            {
                name: `core-store-${id}`,
                port: "store",
                checks: [
                    {
                        Type: "http",
                        Interval: 3000000000, //3 seconds
                        Timeout: 1000000000, //1 second
                        Path: "/",
                        Protocol: "http"
                    }
                ]
            },
            {
                name: `core-python-${id}`,
                port: "python",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 3000000000, //3 seconds 
                        Timeout: 1000000000, //1 second
                        Protocol: "ws"
                    }
                ]
            },
        ],
        envs: {},
        resources: resourceSettings[coreBuild]
    }
}

module.exports = {
    generateJobFile: generateJobFile,
    configurationToImageInfo: configurationToImageInfo
}
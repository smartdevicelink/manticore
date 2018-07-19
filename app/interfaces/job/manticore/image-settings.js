const builder = require('nomad-helper');

//a template for constructing core job files easily
function generateCoreJobFile (jobName, body) {
    const {id, request} = body;
    const {version, build} = request.core;

    const coreInfo = configurationToImageInfo(version, build, id);
    const resources = coreInfo.resources;
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

    job.addTask(groupName, taskName);
    job.setImage(groupName, taskName, coreInfo.imageName);
    for (let portName in coreInfo.portMaps) {
        job.addPort(groupName, taskName, true, portName, coreInfo.portMaps[portName]);
    }
    for (let envName in coreInfo.envs) {
        job.addEnv(groupName, taskName, envName, coreInfo.envs[envName]);
    }
    job.addConstraint({
        LTarget: "${meta.core}",
        Operand: "=",
        RTarget: "1"
    }, groupName);
    //set resource limitations
    job.setCPU(groupName, taskName, resources.cpu);
    job.setMemory(groupName, taskName, resources.memory);
    job.setMbits(groupName, taskName, resources.mbits);
    job.setEphemeralDisk(groupName, resources.disk, false, false);
    job.setLogs(groupName, taskName, resources.logFiles, resources.logSize);

    //add services and health checks for those services

    coreInfo.services.forEach(service => {
        job.addService(groupName, taskName, service.name);
        job.setPortLabel(groupName, taskName, service.name, service.port);

        service.checks.forEach(check => {
            job.addCheck(groupName, taskName, service.name, check);
        });
    });


    return job.getJob();
}

//resource settings depending on the core build type
const coreResourceSettings = {
    default: { //default build resource requirements
        cpu: 100,
        memory: 200,
        mbits: 2,
        disk: 500,
        logFiles: 2,
        logSize: 20
    }
}

//given a branch and build requirement, find an appropriate core image to use and return info for that configuration
function configurationToImageInfo (coreVersion, coreBuild, id) {
    let imageName = `smartdevicelink/manticore-sdl-core:${coreBuild}-${coreVersion}`;

    return {
        imageName: imageName,
        portMaps: {
            broker: 9000,
            tcp: 12345,
            file: 3001,
            log: 8888
        },
        services: [
            {
                name: `core-broker-${id}`,
                port: "broker",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 5000000000, //in nanoseconds
                        Timeout: 1000000000, //in nanoseconds
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
                        Interval: 5000000000, //in nanoseconds
                        Timeout: 1000000000, //in nanoseconds
                        Protocol: "tcp"
                    }
                ]
            },
            {
                name: `core-file-${id}`,
                port: "file",
                checks: [
                    {
                        Type: "http",
                        Interval: 5000000000, //in nanoseconds
                        Timeout: 1000000000, //in nanoseconds
                        Path: "/usr/sdl/bin/storage",
                        Protocol: "http"
                    }
                ]
            },
            {
                name: `core-log-${id}`,
                port: "log",
                checks: [
                    {
                        Type: "tcp",
                        Interval: 5000000000, //in nanoseconds
                        Timeout: 1000000000, //in nanoseconds
                        Protocol: "ws"
                    }
                ]
            }
        ],
        envs: {},
        resources: coreResourceSettings[coreBuild]
    }
}


module.exports = {
    generateCoreJobFile: generateCoreJobFile,
    configurationToImageInfo: configurationToImageInfo
}
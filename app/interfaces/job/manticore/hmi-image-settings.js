const builder = require('nomad-helper');

//a template for constructing hmi job files easily
function generateJobFile (job, body, envs) {
    const {id, request} = body;
    const {version, type} = request.hmi;

    const info = configurationToImageInfo(version, type, id, envs);
    const resources = info.resources;
    //used the passed in job to build on
    const groupName = "hmi-group-" + id;
    const taskName = "hmi-task-" + id;

    job.addGroup(groupName);
    job.setType("batch");
    //remove Update block since this is a batch job
    delete job.getJob().Job.Update;

    //set the restart policy of hmi so that if it dies once, it's gone for good
    //attempts number should be 0. interval and delay don't matter since task is in fail mode
    job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");

    job.addTask(groupName, taskName);
    job.setImage(groupName, taskName, info.imageName);
    for (let portName in info.portMaps) {
        job.addPort(groupName, taskName, true, portName, info.portMaps[portName]);
    }
    for (let envName in info.envs) {
        job.addEnv(groupName, taskName, envName, info.envs[envName]);
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
    info.services.forEach(service => {
        job.addService(groupName, taskName, service.name);
        job.setPortLabel(groupName, taskName, service.name, service.port);

        service.checks.forEach(check => {
            job.addCheck(groupName, taskName, service.name, check);
        });
    });

    return job;
}

//resource settings depending on the hmi type
const resourceSettings = {
    generic: {
        cpu: 40,
        memory: 75,
        mbits: 1,
        disk: 30,
        logFiles: 1,
        logSize: 10
    }
}

//given a version and hmi type, find an appropriate hmi image to use and return info for that configuration
function configurationToImageInfo (version, type, id, envs) {
    let imageName = `smartdevicelink/manticore-hmi-${type}:${version}`;

    return {
        imageName: imageName,
        portMaps: {
            user: 8080
        },
        services: [
            {
                name: `hmi-user-${id}`,
                port: "user",
                checks: [
                    {
                        Type: "http",
                        Interval: 5000000000, //in nanoseconds
                        Timeout: 1000000000, //in nanoseconds
                        Path: "/",
                        Protocol: "http"
                    }
                ]
            },
        ],
        envs: {
            BROKER_ADDR: envs.brokerAddress,
            CORE_FILE_ADDR: envs.coreFileAddress,
        },
        resources: resourceSettings[type]
    }
}

module.exports = {
    generateJobFile: generateJobFile,
    configurationToImageInfo: configurationToImageInfo
}

const builder = require('nomad-helper');

module.exports = {
    generateCoreJobFile: function (body) {
        const {id, request} = body;
        const {version, build} = request.core;

        const coreInfo = configurationToImageInfo(version, build);
        const resources = coreInfo.resources;
        //create a new core job file
        const job = builder.createJob("core-" + id);
        const groupName = "core-group-" + id;
        const taskName = "core-task-" + id;
        const serviceName = "core-service-" + id;
        job.addGroup(groupName);
        job.setType("batch");
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
        job.addService(groupName, taskName, serviceName);
        job.setPortLabel(groupName, taskName, serviceName, coreInfo.servicePort);
        return job.getJob();
    }
}

//resource settings depending on the core build type
const coreResourceSettings = {
    default: {
        cpu: 100,
        memory: 200,
        mbits: 2,
        disk: 500,
        logFiles: 2,
        logSize: 20
    }
}

//given a branch and build requirement, find an appropriate core image to use and return info for that configuration
function configurationToImageInfo (coreVersion, coreBuild) {
    let imageName = `smartdevicelink/manticore-sdl-core:${coreBuild}-${coreVersion}`;

    return {
        imageName: imageName,
        portMaps: {
            broker: 9000,
            tcp: 12345,
            file: 3001,
            log: 8888
        },
        servicePort: "broker",
        envs: {},
        resources: coreResourceSettings[coreBuild]
    }
}

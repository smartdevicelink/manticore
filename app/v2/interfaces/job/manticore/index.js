const builder = require('nomad-helper');

const jobInfo = {
    cores: {
        branches: ["master"],
        builds: []
    }, 
    hmis: {
        generic: {
            branches: ["minimal"]
        }
    }, 
};

function get () {
    return jobInfo;
}

function validate (body) {
    return true;
}

//TODO: return an array of job files. one will be executed and confirmed running before starting another?
//or the results of a job are passed in and another job is returned as a result to run?
function construct () {
    const groupName = "core-group-" + id;
    const taskName = "core-task-" + id;
    const serviceName = "core-service-" + id;
    job.addGroup(groupName);
    job.setType("batch");
    //set the restart policy of core so that if it dies once, it's gone for good
    //attempts number should be 0. interval and delay don't matter since task is in fail mode
    job.setRestartPolicy(groupName, 60000000000, 0, 60000000000, "fail");
    job.addTask(groupName, taskName);
    job.setImage(groupName, taskName, coreImageName);
    job.addPort(groupName, taskName, true, "hmi", 9000);
    job.addPort(groupName, taskName, true, "tcp", 12345);
    job.addPort(groupName, taskName, true, "file", 3001);
    job.addPort(groupName, taskName, true, "log", 8888);
    job.addEnv(groupName, taskName, "DOCKER_IP", "${NOMAD_IP_hmi}");
    job.addConstraint({
        LTarget: "${meta.core}",
        Operand: "=",
        RTarget: "1"
    }, groupName);
    //set resource limitations
    job.setCPU(groupName, taskName, 100);
    job.setMemory(groupName, taskName, 200);
    job.setMbits(groupName, taskName, 2);
    job.setEphemeralDisk(groupName, 500, false, false);
    job.setLogs(groupName, taskName, 2, 25);
    job.addService(groupName, taskName, serviceName);
    job.setPortLabel(groupName, taskName, serviceName, "hmi");
    /*
        var groupName = strings.hmiGroupPrefix + request.id;
        job.addGroup(groupName);
        job.setType("service");
        var taskName = strings.hmiTaskPrefix + request.id;
        job.addTask(groupName, taskName);
        job.setImage(groupName, taskName, hmiImageName);
        job.addPort(groupName, taskName, true, "user", 8080);
        job.addConstraint({
            LTarget: "${meta.core}",
            Operand: "=",
            RTarget: "1"
        }, groupName);
        //set resource limitations
        job.setCPU(groupName, taskName, 40);
        job.setMemory(groupName, taskName, 75);
        job.setMbits(groupName, taskName, 1);
        job.setEphemeralDisk(groupName, 30, false, false);
        job.setLogs(groupName, taskName, 1, 10);
        job.addEnv(groupName, taskName, "HMI_TO_BROKER_ADDR", fullAddressBroker);
        job.addEnv(groupName, taskName, "BROKER_TO_CORE_FILE_ADDR", core.Address + ":" + coreFilePort);

        var serviceName = strings.hmiServicePrefix + request.id;
        job.addService(groupName, taskName, serviceName);
        job.setPortLabel(groupName, taskName, serviceName, "user");
        //add a health check
        var healthObj = {
            Type: "http",
            Name: strings.hmiAliveHealth,
            Interval: 3000000000, //in nanoseconds
            Timeout: 2000000000, //in nanoseconds
            Path: "/",
            Protocol: "http"
        }
        job.addCheck(groupName, taskName, serviceName, healthObj);
    */
}

module.exports = {
    construct: construct,
    get: get,
    validate: validate
}
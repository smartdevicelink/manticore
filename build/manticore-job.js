// Copyright (c) 2018, Livio, Inc.
//load the environment variables from the .env file in the same directory
require('dotenv').config();
var nomader = require('nomad-helper'); //for submitting manticore to nomad
var fs = require('fs');
var ip = require('ip');

var nomadAddress = ip.address() + ":4646";
buildManticoreJobFile();

function buildManticoreJobFile () {
	var job = nomader.createJob("manticore");
	var groupName = "manticore-group";
	var taskName = "manticore-task";
	var serviceName = "manticore-service";
	job.addGroup(groupName);
	job.setType("system"); //one Manticore per client agent with the "manticore" meta attribute being true
	//update one manticore at a time every 10 seconds
	job.setUpdate(1, 10000000000);
	job.setCount(groupName, 1);
	//delete job.getJob().Job.Update;
	//restart manticore if it has failed up to 3 times within 30 seconds, with 5 seconds between restart attempts
	job.setRestartPolicy(groupName, 30000000000, 3, 5000000000, "delay");
	job.addTask(groupName, taskName);
	job.setImage(groupName, taskName, process.env.MANTICORE_IMAGE);
	//http port that is internally 4000, but dynamically allocated on the host
	job.addPort(groupName, taskName, true, "http", 4000);
	//add all environment variables from .env here
	addEnvs(job, groupName, taskName, [
        "JWT_SECRET",
        "NOMAD_AGENT_PORT",
        "CONSUL_AGENT_PORT",
        "LOG_LEVEL",
        "API_VERSION",
        "HAPROXY_HTTP_PORT",
        "DOMAIN_NAME",
        "TCP_PORT_RANGE_START",
        "TCP_PORT_RANGE_END",
        "USAGE_DURATION",
        "WARNING_DURATION",
        "RESET_TIMER_ALLOWED",
        "WEBPAGE_DISABLED",
        "AWS_REGION",
        "AWS_HAPROXY_GROUP_ID",
        "AWS_ELB_GROUP_ID",
        "ELB_MANTICORE_NAME",
        "ELB_ENCRYPT_HTTP",
        "ELB_ENCRYPT_WS",
        "ELB_ENCRYPT_TCP",
        "SSL_CERTIFICATE_ARN",
        "ELB_WS_PORT",
        "CORS",
        "HEALTH_CHECK_PERIOD",
		"MIN_DELAY_BUFFER",
		"MAX_DELAY_BUFFER",
        "MODULE_STORE",
		"MODULE_JOB",
		"MODULE_LOGGER",
		"MODULE_WEBSOCKET",
	]);
	job.addService(groupName, taskName, serviceName);
	job.setPortLabel(groupName, taskName, serviceName, "http");
	job.addCheck(groupName, taskName, serviceName, {
		Type: "http",
		Name: "manticore-alive",
		Interval: 12000000000, //test the health check every 12 seconds
		Timeout: 10000000000, //wait 10 seconds for a response
		Path: "/health",
		Protocol: "http"
	});
	//set resource constraints
	job.setCPU(groupName, taskName, 1000);
	job.setMemory(groupName, taskName, 1000);
	job.setMbits(groupName, taskName, 10);
	job.setEphemeralDisk(groupName, 500, false, false);
	job.setLogs(groupName, taskName, 10, 20);
	job.addConstraint({
		LTarget: "${meta.manticore}",
		Operand: "=",
		RTarget: "1"
	}, groupName);
	job.submitJob(nomadAddress, function (result) {
		console.log("Job submitted");
		console.log(result);
	});
}

function addEnvs (job, group, task, names) {
	for (let i = 0; i < names.length; i++) {
		job.addEnv(group, task, names[i], process.env[names[i]]);
	}
}

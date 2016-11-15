//load the environment variables from the .env file in the same directory
require('dotenv').config();
var nomader = require('nomad-helper'); //for submitting manticore to nomad
var needle = require('needle');
var fs = require('fs');

console.log("Environment variable NODE_LOGS=" + process.env.NODE_LOGS);
console.log("Manticore's environment variables:");
console.log("CLIENT_AGENT_IP: " + process.env.CLIENT_AGENT_IP);
console.log("POST_CONNECTION_ADDR: " + process.env.POST_CONNECTION_ADDR);
console.log("DOMAIN_NAME: " + process.env.DOMAIN_NAME);
console.log("HTTP_PORT: " + process.env.HTTP_PORT);
console.log("TCP_PORT_RANGE_START: " + process.env.TCP_PORT_RANGE_START);   
console.log("TCP_PORT_RANGE_END: " + process.env.TCP_PORT_RANGE_END);   
console.log("HAPROXY_HTTP_LISTEN: " + process.env.HAPROXY_HTTP_LISTEN);   
console.log("HAPROXY_OFF: " + process.env.HAPROXY_OFF);   
console.log("HAPROXY_CONFIG: " + process.env.HAPROXY_CONFIG);   
console.log("HAPROXY_EXEC: " + process.env.HAPROXY_EXEC);   
console.log("HAPROXY_PID: " + process.env.HAPROXY_PID);   

var nomadAddress = process.env.CLIENT_AGENT_IP + ":4646";

var job = buildManticoreJobFile();
/*
var file = fs.readFileSync("../../example.json");
needle.post("http://192.168.1.144:4646/v1/jobs", file.toString(), function (err, res) {
	console.log(res.body);
});
*/
function buildManticoreJobFile () {
	var job = nomader.createJob("manticore");
	var groupName = "manticore-group";
	var taskName = "manticore-task";
	var serviceName = "manticore-service";
	job.addGroup(groupName);
	job.setType("system");
	//update one manticore at a time every 10 seconds
	job.setUpdate(1, 10000000000);
	job.setCount(groupName, 1);
	//restart manticore if it has failed up to 3 times within 30 seconds, with 5 seconds between restart attempts
	job.setRestartPolicy(groupName, 30000000000, 3, 5000000000, "delay"); 
	job.addTask(groupName, taskName);
	job.setImage(groupName, taskName, "crokita/manticore:master");
	//http port that is internally 4000, but dynamically allocated on the host
	job.addPort(groupName, taskName, true, "http", 4000);
	//add all environment variables from .env here
	addEnvs(job, groupName, taskName, [
		"NODE_LOGS",
		"CLIENT_AGENT_IP",
		"POST_CONNECTION_ADDR",
		"DOMAIN_NAME",
		"HTTP_PORT",
		"TCP_PORT_RANGE_START",
		"TCP_PORT_RANGE_END",
		"HAPROXY_HTTP_LISTEN",
		"HAPROXY_OFF",
		"HAPROXY_CONFIG",
		"HAPROXY_EXEC",
		"HAPROXY_PID"
	]);
	job.addService(groupName, taskName, serviceName);
	job.setPortLabel(groupName, taskName, serviceName, "http");
	job.addCheck(groupName, taskName, serviceName, {
		Type: "http",
		Name: "manticore-alive",
		Interval: 3000000000, //in nanoseconds
		Timeout: 2000000000, //in nanoseconds
		Path: "/",
		Protocol: "http"
	});
	//set resource constraints
	job.setCPU(groupName, taskName, 100);
	job.setMemory(groupName, taskName, 100);
	job.setEphemeralDisk(groupName, 150, false, false);
	job.setLogs(groupName, taskName, 10, 5);
	//TODO: ADD CONSTRAINTS USING METADATA DEFINED IN THE CLIENT AGENT
	//expect HAPROXY config to be in /etc/haproxy/haproxy.cfg. it will be mounted in HAPROXY_CONFIG
	//mount the script for controlling the reloading of HAProxy. it will be mounted in HAPROXY_INITD
	job.addVolume(groupName, taskName, "/etc/haproxy/haproxy.cfg:" + process.env.HAPROXY_CONFIG);
	job.addVolume(groupName, taskName, "/usr/sbin/haproxy:" + process.env.HAPROXY_EXEC);
	job.addVolume(groupName, taskName, "/var/run/haproxy.pid:" + process.env.HAPROXY_PID);
	job.submitJob(nomadAddress, function (result) {
		console.log("Job submitted");
		console.log(result);
	});
	//fs.writeFileSync("output.json", JSON.stringify(job.getJob(), null, 4));
	//console.log(job.getJob().Job.TaskGroups[0]);
}

function addEnvs (job, group, task, names) {
	for (let i = 0; i < names.length; i++) {
		job.addEnv(group, task, names[i], process.env[names[i]]);
	}
}
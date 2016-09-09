//functionality of manticore with asynchronous behavior and dependencies for integration testing
var consuler;
var nomader = require('nomad-helper');
var core = require('./core.js');
var needle = require('needle');
var nomadAddress;

module.exports = {
	init: function (address) {
		consuler = require('consul-helper')(address);
		//set the address
		nomadAddress = address + ":4646";
	},
	startWatches: function (postUrl) {
		//set a watch for the KV store
		consuler.watchKVStore("manticore", function (keys) {
			//set up an expectation that we want the values of <keys.length> keys.
			//send a callback function about what to do once we get all the values
			var expecting = core.expect(keys.length, function (job) {
				console.log(process.env.NOMAD_ALLOC_INDEX + ": " + keys.length + " keys")
				console.log(process.env.NOMAD_ALLOC_INDEX + ": submitting a core job");
				console.log(process.env.NOMAD_ALLOC_INDEX + ": there are " + job.getJob().Job.TaskGroups.length + " groups");
				job.submitJob(nomadAddress, function (){});
			});
			for (let i = 0; i < keys.length; i++) {
				//go through each key and get their value. send the value to expecting
				//expecting will keep track of how many more keys are left
				consuler.getKeyValue(keys[i], function (value) {
					expecting.send(keys[i], value);
				});
			}		
		});

		//set up a watch for all services
		consuler.watchServices(function (services) {
			console.log(process.env.NOMAD_ALLOC_INDEX + ": service update! Make HMI job");
			//services updated. get information about core and hmi if possible
			let cores = services.filter("core-master");
			let hmis = services.filter("hmi-master");
			console.log(process.env.NOMAD_ALLOC_INDEX + ": " + cores.length + " cores");
			console.log(cores);
			console.log(process.env.NOMAD_ALLOC_INDEX + ": " + hmis.length + " hmis");
			console.log(hmis);
			//for every core service, ensure it has a corresponding HMI
			var job = nomader.createJob("hmi");
			for (let i = 0; i < cores.length; i++) {
				//pass in the id of core, which should be the first tag
				//also pass in what is repesenting the user in order to name the service
				core.addHmiGroup(job, cores[i].Address, cores[i].Port, cores[i].Tags[0]);
			}	
			//submit the job
			job.submitJob(nomadAddress, function () {});
			var pairs = core.findPairs(cores, hmis);
			console.log(process.env.NOMAD_ALLOC_INDEX + ": found " + pairs.length + " pairs!");
			pairs = {
				pairs: pairs
			};
			//post all pairs at once
			needle.post(postUrl, pairs, function (err, res) {
			});

		});
	},
	requestCore: function (userId, body) {
		//store the userId and request info in the database. wait for this app to find it
		consuler.setKeyValue("manticore/" + userId, JSON.stringify(body));
	},
	deleteKey: function (key, callback) {
		consuler.delKey(key, function () {
			callback();
		});
	},
	deleteJob: function (jobName, callback) {
		nomader.deleteJob(jobName, nomadAddress, function () {
			callback();
		});
	}
}
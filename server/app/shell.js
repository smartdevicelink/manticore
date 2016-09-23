//functionality of manticore with asynchronous behavior and dependencies for integration testing
var consuler;
var nomader = require('nomad-helper');
var core = require('./core.js');
var needle = require('needle');
var config = require('../config.js');
var uuid = require('node-uuid');
var randomString = require('random-string');
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
			//services updated. get information about core and hmi if possible
			let cores = services.filter("core-master");
			let hmis = services.filter("hmi-master");
			//for every core service, ensure it has a corresponding HMI
			var job = nomader.createJob("hmi");
			for (let i = 0; i < cores.length; i++) {
				//pass in the id of core, which should be the first tag
				//also pass in what is repesenting the user in order to name the service
				//pass in the external IP of core so that when the user tries to connect to it
				//from outside the network nginx can route that IP address to the correct internal one
				core.addHmiGroup(job, cores[i].Tags[3], 3000, cores[i].Tags[0]);
			}	
			//submit the job
			job.submitJob(nomadAddress, function () {});
			var pairs = core.findPairs(cores, hmis);
			pairs = {
				pairs: pairs
			};
			//post all pairs at once
			console.log(pairs);
			needle.post(postUrl, pairs, function (err, res) {
			});

		});
	},
	requestCore: function (userId, body) {
		//store the userId and request info in the database. wait for this app to find it
		//also generate unique strings to append to the external IP address that will
		//be given to users. NGINX will map those IPs to the correct internal IP addresses
		//of core and hmi
		//generate random letters and numbers for the user and hmi addresses
		var options = {
			length: 12,
			letters: true,
			numeric: true,
			special: false
		}
		const userToHmiAddress = randomString(options) + "." + config.domainName; //userAddress
		const hmiToCoreAddress = randomString(options) + "." + config.domainName; //hmiAddress
		//since SOME APPS have character limits (15) use a smaller random string generator for the TCP address
		options = {
			length: 4,
			letters: false,
			numeric: true,
			special: false
		}
		const userToCoreAddress = randomString(options) + "." + config.domainName; //tcpAddress
		body.userToHmi = userToHmiAddress;
		body.hmiToCore = hmiToCoreAddress;
		body.userToCore = userToCoreAddress;
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
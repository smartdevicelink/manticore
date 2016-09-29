//functionality of manticore with asynchronous behavior and dependencies for integration testing
var consuler;
var nomader = require('nomad-helper');
var core = require('./core.js');
var needle = require('needle');
var uuid = require('node-uuid');
var randomString = require('randomstring');
var exec = require('child_process').exec;
var fs = require('fs');
var ip = require('ip');
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
				job.submitJob(nomadAddress, function (result){});
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
			core.addHmisToJob(job, cores);
			//submit the job
			job.submitJob(nomadAddress, function () {});
			var pairs = core.findPairs(cores, hmis, function (userId) {
				//remove user from KV store 
				consuler.delKey("manticore/" + userId, function () {});
			});
			pairs = {
				pairs: pairs
			};
			//post all pairs at once
			console.log(pairs);
			needle.post(postUrl, pairs, function (err, res) {
			});
			//create an nginx file and write it so that nginx notices it
			//use the pairs because that has information about what addresses to use
			//NOTE: the user that runs manticore should own this directory or it may not write to the file!
			var nginxFile = core.generateNginxFile(pairs);
		    fs.writeFile("/etc/nginx/conf.d/manticore.conf", nginxFile, function(err) {
		    	//done! restart nginx
		    	exec("sudo service nginx reload", function () {});
		    }); 
		});
	},
	requestCore: function (userId, body) {
		//store the userId and request info in the database. wait for this app to find it
		//also generate unique strings to append to the external IP address that will
		//be given to users. NGINX will map those IPs to the correct internal IP addresses
		//of core and hmi
		//generate random letters and numbers for the user and hmi addresses
		//get all keys in the KV store and find their external address prefixes
		consuler.getKeyAll("manticore", function (results) {
			var addresses = core.getAddressesFromUserRequests(results);
			var options1 = {
				length: 12,
				charset: 'alphanumeric',
				capitalization: 'lowercase'
			}
			var options2 = {
				length: 4,
				charset: 'numeric'
			}

			var func1 = randomString.generate.bind(undefined, options1);
			const userToHmiAddress = core.getUniqueString(addresses, func1); //userAddress prefix
			const hmiToCoreAddress = core.getUniqueString(addresses, func1); //hmiAddress prefix
			//since SOME APPS have character limits (15) use a smaller random string generator for the TCP address
			var func2 = randomString.generate.bind(undefined, options2);
			const userToCoreAddress = core.getUniqueString(addresses, func2); //tcpAddress prefix
			body.userToHmiPrefix = userToHmiAddress;
			body.hmiToCorePrefix = hmiToCoreAddress;
			body.userToCorePrefix = userToCoreAddress;
			consuler.setKeyValue("manticore/" + userId, JSON.stringify(body));
		});

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
	/*checkCore: function () {
		//get the core job allocations
		needle.get('http://' + ip.address() + ':4646/v1/job/core/allocations', null, function (err, res) {
			if (res) {
				//get the last allocation of core
				console.log(res.body.length);
				console.log(res.body[res.body.length - 1]);
				console.log(res.body[res.body.length - 1]["TaskStates"]["core-master"]);
			}
			
		});
	}*/
}
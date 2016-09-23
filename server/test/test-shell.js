var mocha = require('mocha');
var assert = require('assert');
var shell = require('../app/shell.js');
var ip = require('ip');
var express = require('express');
var bodyParser = require('body-parser');
var functionite = require('functionite');

//there should be a local consul agent running bound to the ip address of this machine
//start a server
//server-related initialization
var app = express();
app.use(bodyParser.json()); //allow json parsing
//for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: true})); 
var http = require('http').Server(app);

describe("Job Submitter", function () {
	before(function (done) { 
		shell.init(ip.address());
		http.listen(4000, function () {
			functionite()
				.to(shell.deleteKey, "manticore/jimmy")
				.to(shell.deleteKey, "manticore/susan")
				.to(shell.deleteJob, "core")
				.to(shell.deleteJob, "hmi")
				.then(function (results) {
					done();
				});
		});
	});

	it("should post paired cores to the given url after requests are sent", function (done) {
		//extend the timeout to 2 minutes
		this.timeout(120000);
		const body = {
			build: [],
			branch: {
				hmi: "master",
				core: "master"
			},
			hmiName: "ford",
			url: ""
		}

		//set up an endpoint that listens for paired core information
    	app.post("/v1/address", function (req, res) {
    		var data = req.body;
    		if (data.pairs && data.pairs.length === 1) {
    			assert(data.pairs[0].user === 'jimmy', "Request comes from jimmy. Found " + data.pairs[0].user);
    			assert(data.pairs[0].tcpAddressInternal !== undefined);
    			assert(data.pairs[0].hmiAddressInternal !== undefined);
    			done();
    			//request a second core and listen for another pair
    			//shell.requestCore("susan", body);
    		}
    		//two pairs found
    		if (data.pairs && data.pairs.length === 2) {
    			//done();
    		}
    	});
	    //listen for changes in KV store and in services in Consul
		shell.startWatches("127.0.0.1:4000/v1/address");
		//request a core
		//requesting too many pairs at once may cause the machine to not have enough
		//memory to run all the cores and therefore may cause the test to fail
		shell.requestCore("jimmy", body);

	});

	after(function (done) {
		functionite()
			.to(shell.deleteKey, "manticore/jimmy")
			.to(shell.deleteKey, "manticore/susan")
			.to(shell.deleteJob, "core")
			.to(shell.deleteJob, "hmi")
			.then(function () {
				done();
			});
	});
});
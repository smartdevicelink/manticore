var mocha = require('mocha');
var assert = require('assert');
var shell = require('../app/shell.js');
var ip = require('ip');
var express = require('express');
var bodyParser = require('body-parser');
//there should be a local consul agent running bound to the ip address of this machine
var app;
var http;

describe("Job Submitter", function () {
	before(function (done) {
		shell.init(ip.address());
		//server-related initialization
		app = express();
		app.use(bodyParser.json()); //allow json parsing
		//for parsing application/x-www-form-urlencoded
		app.use(bodyParser.urlencoded({extended: true})); 
		http = require('http').Server(app);
		shell.deleteKey("manticore/jimmy");
		shell.deleteJob("core", function () {
			shell.deleteJob("hmi", function () {
				done();
			});	
		});
	});

	it("should post a paired core to the given url after requests are sent", function (done) {
		//extend the timeout to 2 minutes
		this.timeout(120000);
		//start a server that listens for paired core information
	    http.listen(4000, function () {
        	app.post("/v1/address", function (req, res) {
        		var data = req.body;
        		if (data.pairs && data.pairs.length === 1) {
        			assert(data.pairs[0].user === 'jimmy', "Request comes from jimmy. Found " + data.pairs[0].user);
        			assert(data.pairs[0].tcpAddress !== undefined);
        			assert(data.pairs[0].hmiAddress !== undefined);
        			done();
        		}
        	});
        	ready();
    	});
    	function ready () {
		    //listen for changes in KV store and in services in Consul
			shell.startWatches("127.0.0.1:4000/v1/address");
			//request a core
			const body = {
				build: [],
				branch: {
					hmi: "master",
					core: "master"
				},
				hmiName: "ford",
				url: ""
			}
			//requesting too many pairs at once may cause the machine to not have enough
			//memory to run all the cores and therefore may cause the test to fail
			shell.requestCore("jimmy", body);
    	}

	});

	after(function (done) {
		shell.deleteKey("manticore/jimmy");
		shell.deleteJob("core", function () {
			shell.deleteJob("hmi", function () {
				done();
			});	
		});
	});
});
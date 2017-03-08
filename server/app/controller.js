var express = require('express');
//setup a router for these requests
var router = express.Router();

//the client needs an agent to connect to so that it may access consul services
//supply a host IP address
var app; //express app route provided by context
var logger; //logger module provided by context
var logic; //controller logic which handles all endpoint logic
var controllerLogic = require('./controller-logic.js');

module.exports = function (context) {
	app = context.app;
	logger = context.logger;
	//initialize controller logic
	logic = controllerLogic(context);
	//all APIs are prepended with /v1
	//contain these APIs in this router
	app.use('/v1', router);
	//make all requests pass through an extract ID middleware so
	//that all IDs are stored in req.body.id if the ID was stored in a JWT
	router.use(extractUserId);

	//request core and hmi
	router.post('/cores', validateRequestCore, function (req, res) {
		logger.debug("POST /cores");
		logger.debug(req.body);
		var serverAddress = logic.requestCore(req.body);
		res.send(serverAddress);
	});

	//get logs from core
	router.post('/logs', validateRequestLogs, function (req, res) {
		logger.debug("POST /logs");
		logger.debug(req.body);
		logic.requestLogs(req.body.id);
		res.sendStatus(200);
	});

	//delete a core of a specific id
	router.delete('/cores', validateDeleteCore, function (req, res) {
		logger.debug("DELETE /cores");
		context.logger.debug(req.body);
		logic.deleteCore(req.body.id);
		res.sendStatus(200);
	});

	//get a list of HMIs and their branches
	router.get('/hmis', function (req, res) {
		let hmis = {
			hmis: [
				{
					name: "generic",
					branches: ["master"]
				}
			]
		};
		res.json(hmis);
	});

	//given an HMI, get all valid core branches
	router.get('/cores/:hmiName', function (req, res) {
		//do something with req.params.hmiName
		let branches = {
			branches: [
				"master"
			]
		}
		res.json(branches);
	});

	//given a core branch, get all valid build configurations
	router.get('/builds/:coreBranchName', function (req, res) {
		//do something with req.params.coreBranchName
		let builds = {
			builds: [
				"TIME_TESTER",
				"BUILD_BT_SUPPORT"
			]
		}
		res.json(builds);
	});
}

//middleware function that handles JWT data, if enabled
function extractUserId (req, res, next) {
	//find the user id from the JWT (if JWT is enabled)
	//and place it in the body of the request as <id>
	if (process.env.JWT_SECRET && req.user) {
		var id = req.user.user_id;
		req.body.id = id;
	}
	next();
}

/*
	VALIDATION METHODS
*/

function validateRequestCore (req, res, next) {
	//validate input. right now only the id is required
	if (!req.body.id) {
		res.status(400).send("Please provide user identification");
	}
	else {
		next();
	}
}

function validateRequestLogs (req, res, next) {
	//validate input. right now only the id is required
	if (!req.body.id) {
		res.status(400).send("Please provide user identification");
	}
	else {
		next();
	}
}

function validateDeleteCore (req, res, next) {
	//validate input. right now only the id is required
	if (!req.body.id) {
		res.status(400).send("Please provide user identification");
	}
	else {
		next();
	}
}

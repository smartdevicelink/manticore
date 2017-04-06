var express = require('express');
//setup a router for these requests
var router = express.Router();

//the client needs an agent to connect to so that it may access consul services
//supply a host IP address
var app; //express app route provided by context
var logger; //logger module provided by context
var logic; //controller logic which handles all endpoint logic
var config; //config from the context
var controllerLogic = require('./controller-logic.js');

/** @module app/controller */

module.exports = function (context) {
	app = context.app;
	logger = context.logger;
	//initialize controller logic
	logic = controllerLogic(context);
	config = context.config;

	//For loader.io only
	app.get('/loaderio-e24b4bb0195a1b9ca4bbea3191a2dfdd', function (req, res) {
		res.send("loaderio-e24b4bb0195a1b9ca4bbea3191a2dfdd");
	});

	//for status checks. will be used if the webpage for testing the API is disabled
	app.get('/', function (req, res) {
		res.sendStatus(200);
	});

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

/**
* Middleware function that handles JWT data, if enabled
* @param {object} req - HTTP request
* @param {object} res - HTTP response
* @param {callback} next - Calls the next express middleware
*/
function extractUserId (req, res, next) {
	//find the user id from the JWT (if JWT is enabled)
	//and place it in the body of the request as <id>
	if (config.jwt && req.user) {
		var id = req.user.user_id;
		req.body.id = id;
	}
	next();
}

/*
	VALIDATION METHODS
*/

/**
* Middleware function that determines if the request for requesting core has the correct info
* @param {object} req - HTTP request
* @param {object} res - HTTP response
* @param {callback} next - Calls the next express middleware
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

/**
* Middleware function that determines if the request for requesting logs has the correct info
* @param {object} req - HTTP request
* @param {object} res - HTTP response
* @param {callback} next - Calls the next express middleware
*/
function validateRequestLogs (req, res, next) {
	//validate input. right now only the id is required
	if (!req.body.id) {
		res.status(400).send("Please provide user identification");
	}
	else {
		next();
	}
}

/**
* Middleware function that determines if the request for deleting core/hmi has the correct info
* @param {object} req - HTTP request
* @param {object} res - HTTP response
* @param {callback} next - Calls the next express middleware
*/
function validateDeleteCore (req, res, next) {
	//validate input. right now only the id is required
	if (!req.body.id) {
		res.status(400).send("Please provide user identification");
	}
	else {
		next();
	}
}

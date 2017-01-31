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

	//request core and hmi
	app.post('/v1/cores', extractUserId, validateRequestCore, function (req, res) {
		logger.debug("/v1/cores");
		logger.debug(req.body);
		var serverAddress = logic.requestCore(req.body);
		res.send(serverAddress);
	});

	//get logs from core
	app.post('/v1/logs', extractUserId, validateRequestLogs, function (req, res) {
		logger.debug("/v1/logs");
		logger.debug(req.body);
		logic.requestLogs(req.body.id);
		res.sendStatus(200);
	});

	//get a list of HMIs and their branches
	app.get('/v1/hmis', function (req, res) {
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
	app.get('/v1/cores/:hmiName', function (req, res) {
		//do something with req.params.hmiName
		let branches = {
			branches: [
				"master"
			]
		}
		res.json(branches);
	});

	//given a core branch, get all valid build configurations
	app.get('/v1/builds/:coreBranchName', function (req, res) {
		//do something with req.params.coreBranchName
		let builds = {
			builds: [
				"TIME_TESTER",
				"BUILD_BT_SUPPORT"
			]
		}
		res.json(builds);
	});

	//delete a core passing in an id
	//TODO: change it to accept IDs from a JWT
	app.delete('/v1/cores/:id', function (req, res) {
		//do something with req.params.id
		res.sendStatus(200);
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
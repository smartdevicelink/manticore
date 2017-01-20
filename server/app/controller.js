//the client needs an agent to connect to so that it may access consul services
//supply a host IP address
var shell = require('../lib/shell.js');
var uuid = require('node-uuid');
var logger = require('../lib/logger');

module.exports = function (app, io) {
	//connect to the consul agent
	//let the shell handle the websocket server
	shell.init(process.env.CLIENT_AGENT_IP, io, function () {
		//set up watches one time. listen forever for changes in consul's services
		shell.startWatches(process.env.POST_CONNECTION_ADDR);		
	});

	//start core and hmi
	app.post('/v1/cores', jwtGetUserData, function (req, res) {
		//pretend we have some unique identifier for the client so that
		//we know which client wants what core
		logger.debug("/v1/cores");
		logger.debug(req.body);
		shell.requestCore(req.body.id, req.body);
		var response = shell.requestConnection(req.body.id);
		res.send(response);
	});

	//get logs from core
	app.post('/v1/logs', jwtGetUserData, function (req, res) {
		logger.debug("/v1/logs");
		logger.debug(req.body);
		shell.requestLogs(req.body.id);
		res.sendStatus(200);
	});

	//get a list of HMIs and their branches
	app.get('/v1/hmis', jwtGetUserData, function (req, res) {
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
	app.get('/v1/cores/:hmiName', jwtGetUserData, function (req, res) {
		//do something with req.params.hmiName
		let branches = {
			branches: [
				"master"
			]
		}
		res.json(branches);
	});

	//given a core branch, get all valid build configurations
	app.get('/v1/builds/:coreBranchName', jwtGetUserData, function (req, res) {
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
	app.delete('/v1/cores/:id', jwtGetUserData, function (req, res) {
		//do something with req.params.id
		res.sendStatus(200);
	});
}

//if a JWT token is expected, extract the user data from the payload
function jwtGetUserData (req, res, next) {
	// check header or url parameters or post parameters for token
	if (process.env.JWT_SECRET) {
		var token = req.body.token || req.query.token || req.headers['x-access-token'];

		if (token) {
			//check the authenticity of the token using the shared secret
			jwt.verify(token, process.env.JWT_SECRET, function (err, data) {      
				if (err) {
					res.status(401).send({ error: 'Authentication failure' }); //failed authentication
				} else {
					req.userData = data;  
					logger.debug("AUTHENTICATION! PARSE TOKEN DATA:");
					logger.debug(JSON.stringify(data, null, 4));  
					next();
				}
			});
		} 
		else {
			res.status(401).send({ error: 'Authentication failure' }); //token doesn't even exist
		}	
	}
	else { //no JWT secret shared. manticore isn't expected to verify anything
		next();
	}

}
//the client needs an agent to connect to so that it may access consul services
//supply a host IP address
var core = require('./core.js');
var shell = require('./shell.js');
var uuid = require('node-uuid');
var config = require('../config.js')

module.exports = function (app) {
	//connect to the consul agent
	shell.init(config.consulIp);
	//set up watches one time. listen forever for changes in consul's services
	shell.startWatches(config.postConnectionAddr);
	//start core and hmi
	app.post('/v1/cores', function (req, res) {
		//pretend we have some unique identifier for the client so that
		//we know which client wants what core
		shell.requestCore(uuid.v4(), req.body);
		res.sendStatus(200);
	});

	app.post('/v1/check', function (req, res) {
		//pretend we have some unique identifier for the client so that
		//we know which client wants what core
		shell.checkCore();
		res.sendStatus(200);
	});

	//get a list of HMIs and their branches
	app.get('/v1/hmis', function (req, res) {
		let hmis = {
			hmis: [
				{
					name: "ford",
					branches: ["master", "develop"]
				},
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
				"master",
				"develop"
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
	app.delete('/v1/cores/:id', function (req, res) {
		//do something with req.params.id
		res.sendStatus(200);
	});
}

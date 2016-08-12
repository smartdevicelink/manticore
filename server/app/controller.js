var consul = require('consul')(); //start a consul agent
//join this agent to the cluster
consul.agent.join('192.168.1.142', function (err) {
	if (err) throw err;
});

module.exports = function (app) {
	app.post('/cores', function (req, res) {
		console.log(req.body);
		console.log("ayy lmao");
		//request a list of all the running services
		consul.catalog.service.list(function (err, result) {
			if (err) throw err;
			console.log(result);
			res.sendStatus(200);
		});
	});
}
//the client needs an agent to connect to so that it may access consul services
//supply a host IP address in the options array
var options = {
	host: "192.168.1.144"
};
var consul = require('consul')(options); //start a consul client
console.log(process.env.HOST_IP);
//join this agent to the cluster
consul.agent.join('192.168.1.142', function (err, eh) {
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
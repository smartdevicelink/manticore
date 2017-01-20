var id = Math.floor(Math.random()*1000);

var body = {
	"url": "http://192.168.1.142:3000/v1/address",
	"build": [],
	"branch": {
		"hmi": "master",
		"core": "master"
	},
	"hmiName": "ford",
	"id": id
}

var body2 = {
	"id": id
}


var socket;

function requestInstance() {
	$.post('/v1/cores', body, function (wsUrl) {
		//the data contains the url we need to connect to the websocket server
		if (!socket) {
			//make a connection using the url given
			console.log(wsUrl);
			socket = io(wsUrl);
			socket.on('connectInfo', function (data) {
				console.log("connection information!");
				console.log(data);
			});
			//core log data
			socket.on('logs', function (data) {
				console.log(data);
			});
			//position in queue data
			socket.on('position', function (pos) {
				console.log("Current position: " + pos);
			});
		}
	});
}

function requestLogs() {
	$.post('/v1/logs', body2, function (result) {});
}
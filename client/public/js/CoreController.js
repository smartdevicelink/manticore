var body = {
	"url": "http://192.168.1.142:3000/v1/address",
	"build": [],
	"branch": {
		"hmi": "master",
		"core": "master"
	},
	"hmiName": "ford"
}

var body2 = {
	"id": Math.floor(Math.random()*1000)
}


var socket;

function requestInstance() {
	$.post('/v1/cores', body, function (data) {
		console.log(data);
	});
}

function requestLogs() {
	$.post('/v1/logs', body2, function (data) {
		//the data contains the url we need to connect to the websocket server
		if (!socket) {
			//make a connection using the url given
			var address = data.url + "/" + body2.id;
			console.log(address);
			socket = io(address);
			socket.on('logs', function (data) {
				console.log(data);
			});
		}
	});
}
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
	$.post('/v1/cores', body, function (data) {
		console.log(data);
	});
}

function requestLogs() {
	$.post('/v1/logs', body2, function (data) {
		//the data contains the url we need to connect to the websocket server
		if (!socket) {
			//make a connection using the url given
			var address = data.url + "/" + data.connectionId;
			socket = io(address);
			socket.on('logs', function (data) {
				console.log(data);
			});
		}
	});
}
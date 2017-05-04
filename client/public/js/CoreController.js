var id = Math.floor(Math.random()*1000);

var body = {
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
			//inactivity timer
			socket.on('inactivity', function (secondsLeft) {
				console.log("WARNING: " + secondsLeft + " seconds left before shutting down the instance!");
			});
		}
	});
}

function requestLogs() {
	$.post('/v1/logs', body2, function (result) {});
}

function deleteCore() {
	$.ajax({
		url: '/v1/cores',
		type: 'DELETE',
		data: body2,
		success: function (result) {}
	});
}

var requestedLogs = false;
function instanceLogs () {
	$.post('/v1/cores', body, function (wsUrl) {

		//the data contains the url we need to connect to the websocket server
		if (!socket) {
			//make a connection using the url given
			console.log(wsUrl);
			socket = io(wsUrl);
			socket.on('connectInfo', function (data) {
				console.log("connection information!");
				console.log(data);

				//request logs only when we have received connection info
				if (!requestedLogs) {
					$.post('/v1/logs', body2, function (result) {});
					requestedLogs = true;
				}
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
var body = {
	"url": "http://192.168.1.142:3000/v1/address",
	"build": [],
	"branch": {
		"hmi": "master",
		"core": "master"
	},
	"hmiName": "ford"
}

function requestInstance() {
	$.post('/v1/cores', body, function (data) {
		console.log(data);
	});
}
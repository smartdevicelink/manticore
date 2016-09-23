module.exports = {
	//ip of the local consul client agent
	consulIp: "127.0.0.1"
	//the address and route of the service which is supposed to send the connection information to the user
	postConnectionAddr: "127.0.0.1:3000/v1/address",
	//the name of your domain that you use to direct users to local ip addresses of cores and hmis
	domainName: "manticore.livio.io",
	//port of the web server
	httpPort: 3000
}
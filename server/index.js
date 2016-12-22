//load the environment variables from the .env file in the same directory (remove when using docker containers)
//require('dotenv').config();
//modules
var express = require('express');
var bodyParser = require('body-parser');
//server-related initialization
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
//custom vars and modules
var controller = require('./app/controller.js');
var logger = require('./lib/logger.js');
var rootLocation = __dirname + '/../client/public';
var ip = require('ip');

app.use(bodyParser.json()); //allow json parsing
app.use(bodyParser.urlencoded({extended: true})); //for parsing application/x-www-form-urlencoded
//allow any content from inside /client/public to be brought to the user
//expose everything in public. The main index.html file should exist inside public but not inside html/
app.use(express.static(rootLocation));  

//start the server
(function () {
    var server = http.listen(process.env.HTTP_PORT, function () {
        logger.info("Server started");
        logger.info("Environment variable NODE_LOGS=" + process.env.NODE_LOGS);
        logger.debug("Manticore's environment variables:");
        logger.debug("CLIENT_AGENT_IP: " + process.env.CLIENT_AGENT_IP);
        logger.debug("DOMAIN_NAME: " + process.env.DOMAIN_NAME);
        logger.debug("HTTP_PORT: " + process.env.HTTP_PORT);
        logger.debug("TCP_PORT_RANGE_START: " + process.env.TCP_PORT_RANGE_START);   
        logger.debug("TCP_PORT_RANGE_END: " + process.env.TCP_PORT_RANGE_END);   
        logger.debug("HAPROXY_HTTP_LISTEN: " + process.env.HAPROXY_HTTP_LISTEN);   
        logger.debug("HAPROXY_OFF: " + process.env.HAPROXY_OFF); 
        logger.debug("CONTAINER IP ADDRESS: " + process.env.NOMAD_IP_http + ":" + process.env.NOMAD_HOST_PORT_http); 
        //let shell.js handle the websocket server
        controller(app, io);
    });
})();
//load the environment variables from the .env file in the same directory
require('dotenv').config();
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

//if NGINX_MAIN_DIRECTORY or NGINX_TCP_DIRECTORY aren't specified, use the defaults here
if (!process.env.NGINX_MAIN_DIRECTORY) {
    process.env.NGINX_MAIN_DIRECTORY = "/etc/nginx/conf.d";
} 
if (!process.env.NGINX_TCP_DIRECTORY) {
    process.env.NGINX_TCP_DIRECTORY = "/etc/nginx/tcp.d";
} 

//start the server
(function () {
    var server = http.listen(process.env.HTTP_PORT, function () {
        logger.info("Server started");
        logger.info("Environment variable NODE_LOGS=" + process.env.NODE_LOGS);
        logger.debug("Manticore's environment variables:");
        logger.debug("CLIENT_AGENT_IP: " + process.env.CLIENT_AGENT_IP);
        logger.debug("POST_CONNECTION_ADDR: " + process.env.POST_CONNECTION_ADDR);
        logger.debug("DOMAIN_NAME: " + process.env.DOMAIN_NAME);
        logger.debug("HTTP_PORT: " + process.env.HTTP_PORT);
        logger.debug("NGINX_HTTP_LISTEN: " + process.env.NGINX_HTTP_LISTEN);
        logger.debug("NGINX_TCP_LISTEN: " + process.env.NGINX_TCP_LISTEN);
        logger.debug("NGINX_OFF: " + process.env.NGINX_OFF);
        logger.debug("NGINX_MAIN_DIRECTORY: " + process.env.NGINX_MAIN_DIRECTORY);
        logger.debug("NGINX_TCP_DIRECTORY: " + process.env.NGINX_TCP_DIRECTORY);
        if (process.env.NGINX_MAIN_DIRECTORY === process.env.NGINX_TCP_DIRECTORY) {
            logger.error("NGINX_MAIN_DIRECTORY and NGINX_TCP_DIRECTORY cannot be the same!");
        }
        if (process.env.NGINX_HTTP_LISTEN === process.env.NGINX_TCP_LISTEN) {
            logger.error("NGINX_HTTP_LISTEN and NGINX_TCP_LISTEN cannot be the same!");
        }     
        //let shell.js handle the websocket server
        controller(app, io);
    });
})();
//main entry point

//trace. only require it if the TRACE_SERVICE_NAME and TRACE_API_KEY exist
if (process.env.TRACE_SERVICE_NAME && process.env.TRACE_API_KEY) {
    logger.debug("Trace enabled");
    require('@risingstack/trace');
}

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
var cors = require('cors'); //easily allow cross-origin requests
var expressJwt = require('express-jwt');
var jwt = require('jsonwebtoken');
var Context = require('./lib/Context.js'); //stores a set of modules and objects that are globally needed


app.use(bodyParser.json()); //allow json parsing
app.use(bodyParser.urlencoded({extended: true})); //for parsing application/x-www-form-urlencoded

if (process.env.JWT_SECRET) {
    //pass the JWT secret token, if any, to express for message encryption
    //if the JWT secret exists then require that the token is passed through
    //the request for authentication purposes
    logger.debug("JWT_SECRET found");
    //allow GET to the main route '/' and the Controller.js file
    app.use(expressJwt({
        secret: process.env.JWT_SECRET
    })
    .unless({path: ['/', '/js/CoreController.js']})
    );
}

//allow any content from inside /client/public to be brought to the user
//expose everything in public. The main index.html file should exist inside public but not inside html/
app.use(express.static(rootLocation));  
if (process.env.CORS === "true") {
    app.use(cors({credentials: true, origin: true}));
}

//start the server
(function () {
    http.listen(process.env.HTTP_PORT, function () {
        logger.info("HTTP Server started");
        logger.info("Environment variable NODE_LOGS=" + process.env.NODE_LOGS);
        logger.debug("Manticore's environment variables:");
        logger.debug("CLIENT_AGENT_IP: " + process.env.CLIENT_AGENT_IP);
        logger.debug("DOMAIN_NAME: " + process.env.DOMAIN_NAME);
        logger.debug("ELB_SSL_PORT: " + process.env.ELB_SSL_PORT);
        logger.debug("HTTP_PORT: " + process.env.HTTP_PORT);
        logger.debug("TCP_PORT_RANGE_START: " + process.env.TCP_PORT_RANGE_START);   
        logger.debug("TCP_PORT_RANGE_END: " + process.env.TCP_PORT_RANGE_END);   
        logger.debug("HAPROXY_HTTP_LISTEN: " + process.env.HAPROXY_HTTP_LISTEN);   
        logger.debug("HAPROXY_OFF: " + process.env.HAPROXY_OFF); 
        logger.debug("CORS: " + process.env.CORS); 
        logger.debug("AWS_REGION: " + process.env.AWS_REGION); 
        logger.debug("CONTAINER IP ADDRESS: " + process.env.NOMAD_IP_http + ":" + process.env.NOMAD_HOST_PORT_http); 

        //instantiate the context
        var context = new Context(app, io, logger, process.env.CLIENT_AGENT_IP); 
        //pass the context to the controller
        controller(context);
    });
})();
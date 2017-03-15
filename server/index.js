//main entry point
//modules
var express = require('express');
var bodyParser = require('body-parser');
//server-related initialization
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
//custom vars and modules
//check if the configuration is valid first! Fail if the developer uses dumb environment configurations
var config = require('./lib/config.js');

var controller = require('./app/controller.js');
var logger = require('./lib/logger.js')(config.logLevel);
var rootLocation = __dirname + '/../client/public';
var ip = require('ip');
var cors = require('cors'); //easily allow cross-origin requests
var expressJwt = require('express-jwt');
var jwt = require('jsonwebtoken');
var Context = require('./lib/Context.js'); //stores a set of modules and objects that are globally needed

//trace. only require it if the config for trace is valid
if (config.trace) {
    logger.debug("Trace enabled");
    require('@risingstack/trace');
}

app.use(bodyParser.json()); //allow json parsing
app.use(bodyParser.urlencoded({extended: true})); //for parsing application/x-www-form-urlencoded

if (config.jwt) {
    //pass the JWT secret token, if any, to express for message encryption
    //if the JWT secret exists then require that the token is passed through
    //the request for authentication purposes
    logger.debug("JWT Secret found");
    //allow GET to the main route '/' and the Controller.js file
    app.use(expressJwt({
        secret: config.jwt.secret
    })
    .unless({path: ['/', '/js/CoreController.js']})
    );
}

//allow any content from inside /client/public to be brought to the user
//expose everything in public. The main index.html file should exist inside public but not inside html/
app.use(express.static(rootLocation));  
if (config.cors === "true") {
    app.use(cors({credentials: true, origin: true}));
}

//start the server
(function () {
    http.listen(process.env.HTTP_PORT, function () {
        logger.info("HTTP Server started");
        //general stuff
        logger.info("Environment variable NODE_LOGS=" + config.logLevel);
        logger.info("Manticore's environment variables:");
        logger.info("Client Agent IP: " + config.clientAgentIp);
        logger.info("HTTP Server Port: " + config.httpPort);
        logger.info("CORS enabled: " + config.cors); 
        //jwt secret and trace info purposely not logged
        //HAPRoxy stuff
        if (config.haproxy) {
            logger.info("Domain Name: " + config.haproxy.domainName);
            logger.info("TCP Starting Port Range: " + config.haproxy.tcpPortRangeStart);   
            logger.info("TCP Ending Port Range: " + config.haproxy.tcpPortRangeEnd);   
            logger.info("HAProxy HTTP Listening Port: " + config.haproxy.httpListen);  
            if (config.haproxy.elb) {
                //AWS ELB stuff
                logger.info("AWS Region Name: " + config.haproxy.elb.awsRegion); 
                logger.info("ELB Name for Manticore: " + config.haproxy.elb.manticoreName); 
                logger.info("ELB SSL Listener Port: " + config.haproxy.elb.sslPort);
                logger.info("SSL Ceritificate ARN: " + config.haproxy.elb.sslCertificateArn);                 
            }
        }
        //Nomad-configured environment variables. Useful for the developer to find where Manticore is
        logger.info("CONTAINER IP ADDRESS: " + process.env.NOMAD_IP_http + ":" + process.env.NOMAD_HOST_PORT_http); 

        //instantiate the context
        var context = new Context(app, io, logger, config); 
        //pass the context to the controller
        controller(context);
    });
})();
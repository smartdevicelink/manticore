//modules
var express = require('express');
var bodyParser = require('body-parser');
//server-related initialization
var app = express();
var http = require('http').Server(app);
//custom vars and modules
var controller = require('./app/controller.js');
var rootLocation = __dirname + '/../client/public';

app.use(bodyParser.json()); //allow json parsing
app.use(bodyParser.urlencoded({extended: true})); //for parsing application/x-www-form-urlencoded
//allow any content from inside /client/public to be brought to the user
//expose everything in public. The main index.html file should exist inside public but not inside html/
app.use(express.static(rootLocation));

//load the environment variables from the .env file in the same directory
require('dotenv').config();
//start the server
(function () {
    var server = http.listen(process.env.HTTP_PORT, function () {
        console.log("Server started");
        controller(app);
    });
})();
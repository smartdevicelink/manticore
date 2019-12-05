// Copyright (c) 2018, Livio, Inc.
require('dotenv').config(); //load environment
const Koa = require('koa');
const serve = require('koa-static');
const bodyParser = require('koa-bodyparser'); //for parsing JSON
const app = new Koa();
const config = require('./config');

//add ability to parse JSON from posts
app.use(bodyParser());

//serve Manticore webpage if enabled
if (!config.webpageDisabled) {
    app.use(serve(__dirname + '/webpage'));
}

//setup all koa middleware under the selected version in /api
require(`./api/${config.apiVersion}`)(app);

//uncaught error handler
app.use(async (ctx, next) => {
    try {
        await next();
    }
    catch (err) {
        console.error(err);
    }
});

app.listen(config.httpPort);

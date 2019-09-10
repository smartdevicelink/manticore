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
//Must build it first by running 'npm run build-webpage'
if (!config.webpageDisabled) {
    app.use(serve(__dirname + '/webpage'));
}

//setup all koa middleware under the selected version in /api
const loadedApi = require(`./api/${config.apiVersion}`)
loadedApi.start(app);



//uncaught error handler
app.use(async (ctx, next) => {
    try {
        await next();
    }
    catch (err) {
        console.error(err);
    }
});

const server = app.listen(config.httpPort);
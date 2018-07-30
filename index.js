require('dotenv').config(); //load environment
const Koa = require('koa');
const bodyParser = require('koa-bodyparser'); //for parsing JSON
const app = new Koa();
const config = require('./config');

//add ability to parse JSON from posts
app.use(bodyParser());

//health endpoint
app.use(async (ctx, next) => {
    if (ctx.request.url !== "/health") return await next();
    ctx.response.status = 200;
});

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
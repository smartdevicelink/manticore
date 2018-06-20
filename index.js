require('dotenv').config(); //load environment
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const app = new Koa();
const fs = require('fs');
const config = require('./config');

//setup all koa middleware under app/
fs.readdir('api', (err, folders) => {
    folders.forEach(folder => {
        require(`./api/${folder}`)(app);
    });
})

//add ability to parse JSON from posts
app.use(bodyParser());

//health endpoint
app.use(async (ctx, next) => {
    if (ctx.request.url !== "/health") return await next();
    ctx.response.status = 200;
});

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
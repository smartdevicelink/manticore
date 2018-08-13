require('dotenv').config(); //load environment
const Koa = require('koa');
const serve = require('koa-static');
const cors = require('koa-cors');
const bodyParser = require('koa-bodyparser'); //for parsing JSON
const app = new Koa();
const config = require('./config');

//add ability to parse JSON from posts
app.use(bodyParser());

//serve Manticore webpage if enabled
//Must build it first by running 'npm run build-webpage'
if (!config.webpageDisabled) {
    app.use(cors());
    app.use(serve(__dirname + '/dist'));
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

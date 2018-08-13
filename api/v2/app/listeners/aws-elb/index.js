const config = require('../../config.js');
const AwsHandler = require('./AwsHandler.js');
AwsHandler.init();

module.exports = {
	"post-waiting-job-advance": async (ctx, next) =>{
		if(config.modes.haproxy){
			AwsHandler.changeState(ctx.waitingState);
		}
		next();
	}
}
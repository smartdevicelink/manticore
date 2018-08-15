const config = require('../../config.js');
const AwsHandler = require('./AwsHandler.js')();

module.exports = {
	"post-waiting-job-advance": async (ctx, next) =>{
		if (config.modes.elb) {
			await AwsHandler.changeState(ctx.waitingState);
		}
		next();
	}
}

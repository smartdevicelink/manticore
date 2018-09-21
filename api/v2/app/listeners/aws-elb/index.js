// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const logger = config.logger;
const AwsHandler = require('../../AwsHandler.js')();

module.exports = {
	"post-waiting-job-advance": async (ctx, next) =>{
		if (config.modes.elb) {
			await AwsHandler.changeState(ctx.waitingState)
				.catch(err => logger.error(new Error(err).stack));
		}
		next();
	}
}

// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const AwsHandler = require('../../AwsHandler.js')();

module.exports = {
	"post-waiting-job-advance": async (ctx, next) =>{
		next(); //don't hold up the stack. there are known problems with the AWS API not responding quickly
		if (config.modes.elb) {
			await AwsHandler.changeState(ctx.waitingState);
		}
	}
}

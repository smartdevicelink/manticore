const config = require('./config.js');
const {store, services, job, logger} = config;

const watches = {};

module.exports = {
	add: async function (id, watch) {
		const storedWatch = watches[id];

	}
}
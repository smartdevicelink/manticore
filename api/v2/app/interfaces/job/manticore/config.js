const config = require('../../../config.js');

module.exports = {
    clientAgentIp: config.clientAgentIp,
    nomadAgentPort: config.nomadAgentPort,
    consulAgentPort: config.consulAgentPort,
    logger: config.logger,
}
module.exports = {
    //module settings
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost', //assumes manticore is launched by nomad
    nomadAgentPort: process.env.NOMAD_AGENT_PORT || 4646, //the port the nomad agent listens on
    consulAgentPort: process.env.CONSUL_AGENT_PORT || 8500, //the port the consul agent listens on
}
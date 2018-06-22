module.exports = {
    //module settings
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost', //assumes manticore is launched by nomad
    clientAgentPort: process.env.NOMAD_AGENT_PORT || 4646 //the port the nomad agent listens to
}
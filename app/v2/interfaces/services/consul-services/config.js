module.exports = {
    //module settings
    clientAgentIp: process.env.NOMAD_IP_http || 'localhost' //assumes manticore is launched by nomad
}
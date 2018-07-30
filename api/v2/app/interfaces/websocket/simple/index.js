const random = require('randomstring');

let idHash = {};

//generate or return an existing passcode given an id
async function getPasscode (id) {
    if (!idHash[id]) {
        const str = random.generate({
            length: 16,
            charset: 'alphanumeric'
        });
        idHash[id] = {
            code: str,
            websocket: null
        };
    }
    return idHash[id].code; //return the generated code
}

//remove a passcode of an id so that a new one must be made
async function deletePasscode (id) {
    //close the websocket if it exists
    if (idHash[id] && idHash[id].websocket) {
        idHash[id].websocket.close();
    }
    delete idHash[id];
}

//attach the websocket to the id whose code matches
//returns the id associated with the passcode
async function validate (code, websocket) {
    for (let id in idHash) {
        if (idHash[id] && idHash[id].code === code) {
            idHash[id].websocket = websocket;
            return id; //found it
        }
    }
    return null;
}

//use the attached websocket to send messages to the client
async function send (id, message) {
    if (!idHash[id] || !idHash[id].websocket) return; //no websocket found
    idHash[id].websocket.send(JSON.stringify(message));
}

module.exports = {
    getPasscode: getPasscode,
    deletePasscode: deletePasscode,
    validate: validate,
    send: send
}
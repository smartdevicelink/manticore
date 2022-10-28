// Copyright (c) 2018, Livio, Inc.
const config = require('./config');
const logger = config.logger;
const randomize = require('randomatic');

let idHash = {};

//generate or return an existing passcode given an id
async function getPasscode (id) {
    if (!idHash[id]) {
        const str = randomize('Aa0', 16); //generate an alphanumeric code
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

//Verify the id's existence and return true if it does
function isIdExist (id) {
    return idHash[id] && idHash[id].websocket;
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
    try {
        idHash[id].websocket.send(message);
    }
    catch (err) { //websocket likely closed while attempting to send the message
        logger.debug(`Cannot send websocket message to user ${id}`);
    }
}

module.exports = {
    getPasscode: getPasscode,
    deletePasscode: deletePasscode,
    validate: validate,
    send: send,
    isIdExist: isIdExist
}

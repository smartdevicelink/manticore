module.exports = SocketHandler;
//a client connected to Manticore. holds extra information per socket

/**
* Manages websocket connections across users and sends information about their core/hmi locations
* @constructor
* @param {object} io - A socket.io instance
*/
function SocketHandler (io) {
    this.websocket = io;
    this.sockets = {};
}

/**
* Starts a websocket server that is able to stream information to the client
* @param {string} id - The id of the user that is connecting to Manticore
*/
SocketHandler.prototype.requestConnection = function (id) {
    var self = this;
    var custom = this.websocket.of('/' + id);
    custom.on('connection', function (socket) {
        //save this socket object
        self.addSocket(id, socket);
        //resend connection information if it exists!
        self.send(id, "connectInfo");
        self.send(id, "position");
    });
    custom.on('disconnect', function () {
        //remove socket, but only the socket. keep the connection information/position
        self.removeSocket(id);
    });
}

/**
* Remove outdated information of connection objects that shouldn't exist anymore
* @param {array} requestKeyArray - Array of ids whose websocket servers should be open for
*/
SocketHandler.prototype.cleanSockets = function (requestKeyArray) {
    //now check if each element in the sockets object exists in the requests
    //if it doesn't, remove the cached information
    for (var key in this.sockets) {
        if (requestKeyArray.indexOf(key) === -1) {
            //not found. remove the cached information
            delete this.sockets[key].position;
            delete this.sockets[key].addresses;
        }
    }
}

/**
* Make a connection socket object but without the socket itself
* @param {string} id - Id of a user using Manticore
*/
SocketHandler.prototype.newSocket = function (id) {
    this.sockets[id] = new ConnectionSocket();
}

/**
* Remove the ConnectionSocket attached to the id of a user
* @param {string} id - Id of a user using Manticore
*/
SocketHandler.prototype.removeConnection = function (id) {
    if (this.checkId(id)) {
        //remove all information. call this if the user is not in the waiting list anymore
        delete this.sockets[id];
    }
}

/**
* Add a socket and attach it to the id of a user
* @param {string} id - Id of a user using Manticore
* @param {object} socket - socket of the connection to the user
*/
SocketHandler.prototype.addSocket = function (id, socket) {
    if (this.checkId(id)) { 
        //this id was found before! associate the id with the new socket
        this.sockets[id].socket = socket;
        
    }
    else { //if the id doesn't exist in the cache
        this.sockets[id] = new ConnectionSocket(socket);
    }
}

/**
* Remove the socket attached to the id of a user in the ConnectionSocket
* @param {string} id - Id of a user using Manticore
*/
SocketHandler.prototype.removeSocket = function (id) {
    if (this.checkId(id)) {
        //only remove the socket itself! cache the other information
        //in case the user reconnects and needs them back
        delete this.sockets[id].socket;
    }
}

/**
* Send the user new information about the position in the waiting list
* @param {string} id - Id of a user using Manticore
* @param {number} data - The new position of the id of the user in the waiting list
*/
SocketHandler.prototype.updatePosition = function (id, data) {
    if (!this.checkId(id)) { //make a new connection socket if it doesn't exist
        this.newSocket(id);
    }
    //only send info if it's new info
    var newInfo = (this.sockets[id].position !== data);
    this.sockets[id].position = data;
    if (newInfo) {
        this.send(id, "position");
    }
}

/**
* Send the user new information about their core/hmi address locations
* @param {string} id - Id of a user using Manticore
* @param {object} data - The new position of the id of the user in the waiting list
*/
SocketHandler.prototype.updateAddresses = function (id, data) {
    if (!this.checkId(id)) { //make a new connection socket if it doesn't exist
        this.newSocket(id);
    }
    //only send info if it's new info
    var newInfo = (JSON.stringify(this.sockets[id].addresses) !== JSON.stringify(data));
    this.sockets[id].addresses = data;
    if (newInfo) {
        this.send(id, "connectInfo");
    }
}

/**
* Tries to find a ConnectionSocket associated with an id
* @param {string} id - Id of a user using Manticore
* @returns {ConnectionSocket} - A connection socket object of the id, if it exists. May be null
*/
SocketHandler.prototype.checkId = function (id) {
    return this.sockets[id];
}

/**
* Sends address information and position, if any
* @param {string} id - Id of a user using Manticore
* @param {string} keyword - String that informs the function what kind of information to transmit
* @param {string} logData - Optional. The log stream data from the Nomad HTTP API
*/
SocketHandler.prototype.send = function (id, keyword, logData) {
    //also check if the socket exists
    if (this.checkId(id) && this.sockets[id].socket) {
        var connection = this.sockets[id];
        //only send the information if it exists
        //for the position that is a number and 0 is a possible value which is falsy.
        //we don't want to interpret 0 as falsy, so check for undefined/null instead
        if (keyword === "position" && connection.position !== undefined && connection.position !== null) {
            connection.socket.emit(keyword, connection.position);
        }  
        if (keyword === "connectInfo" && connection.addresses) {
            connection.socket.emit(keyword, connection.addresses);
        } 
        //logs don't need to be stored since Nomad stores them for us
        if (keyword === "logs") {
            connection.socket.emit(keyword, logData);
        } 
    }
}

/**
* Inner class that contains the socket, as well as other important information.
* Includes a position property which stores information about a user's position in the waiting list
* Includes an addresses property which stores an object about address information for a user
* @constructor
* @param {object} socket - The socket from a connection to the user
*/
function ConnectionSocket (socket) {
    this.socket = socket;
    this.position;
    this.addresses;
}
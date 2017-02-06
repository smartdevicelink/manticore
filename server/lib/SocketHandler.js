module.exports = SocketHandler;

//a client connected to Manticore. holds extra information per socket
function SocketHandler (io) {
    this.websocket = io;
    this.sockets = {};
}

//starts a websocket server that is able to stream information to the client
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

//remove outdated information of connection objects that shouldn't exist anymore
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

//make a connection socket object but without the socket itself
SocketHandler.prototype.newSocket = function (id) {
    this.sockets[id] = new ConnectionSocket();
}

SocketHandler.prototype.removeConnection = function (id) {
    if (this.checkId(id)) {
        //remove all information. call this is the user is not in the waiting list anymore
        delete this.sockets[id];
    }
}

SocketHandler.prototype.addSocket = function (id, socket) {
    if (this.checkId(id)) { 
        //this id was found before! associate the id with the new socket
        this.sockets[id].socket = socket;
        
    }
    else { //if the id doesn't exist in the cache
        this.sockets[id] = new ConnectionSocket(socket);
    }
}

SocketHandler.prototype.removeSocket = function (id) {
    if (this.checkId(id)) {
        //only remove the socket itself! cache the other information
        //in case the user reconnects and needs them back
        delete this.sockets[id].socket;
    }
}

SocketHandler.prototype.setPosition = function (id, data) {
    if (!this.checkId(id)) { //make a new connection socket if it doesn't exist
        this.newSocket(id);
    }
    this.sockets[id].position = data;
}

SocketHandler.prototype.setAddresses = function (id, data) {
    if (!this.checkId(id)) { //make a new connection socket if it doesn't exist
        this.newSocket(id);
    }
    this.sockets[id].addresses = data;
}

SocketHandler.prototype.checkId = function (id) {
    return this.sockets[id];
}

//sends address information and position, if any
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

//inner class that is the socket itself, as well as other important information 
//such as waiting list position and core/hmi connection information
function ConnectionSocket (socket) {
    this.socket = socket;
    this.position;
    this.addresses;
}
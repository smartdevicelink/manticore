module.exports = SocketHandler;

//a client connected to Manticore. holds extra information per socket
function SocketHandler (io) {
    this.websocket = io;
    this.sockets = {};
}

//starts a websocket server that is able to stream information to the client
SocketHandler.prototype.requestConnection = function (id) {
    var custom = this.websocket.of('/' + id);
    custom.on('connection', function (socket) {
        logger.debug("Client connected: " + id);
        //save this socket object
        this.addSocket(socket);
        //resend connection information if it exists!
        this.send(id, "connectInfo");
        this.send(id, "position");
    });
    custom.on('disconnect', function () {
        logger.debug("Client disconnected: " + id);
        //remove socket, but only the socket. keep the connection information/position
        this.removeSocket(id);
    });
}

//remove outdated information of connection objects that shouldn't exist anymore
SocketHandler.prototype.cleanSockets = function (requestKeyArray) {
    //now check if each element in the sockets object exists in the requests
    //if it doesn't, remove it
    for (var key in this.sockets) {
        if (requestKeyArray.indexOf(key) === -1) {
            //not found. close socket connection and remove from sockets list 
            this.sockets[key].socket.disconnect(true);
            delete this.sockets[key];
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
        if (keyword === "position" && connection.position) {
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
module.exports = function () {
    return new SocketHandler();
}

//a client connected to Manticore. holds extra information per socket
function SocketHandler () {
    this.sockets = {};
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
    if (this.checkId(id)) {
        this.sockets[id].position = data;
    }
}

SocketHandler.prototype.setAddresses = function (id, data) {
    if (this.checkId(id)) {
        this.sockets[id].addresses = data;
    }
}

SocketHandler.prototype.checkId = function (id) {
    return this.sockets[id];
}

//sends address information and position, if any
SocketHandler.prototype.send = function (id, keyword, logData) {
    if (this.checkId(id)) {
        var connection = this.sockets[id];

        if (keyword === "position" && connection.position) {
            connection.socket.emit(keyword, connection.position);
        }  
        if (keyword === "connectInfo" && connection.addresses) {
            connection.socket.emit(keyword, connection.addresses);
        } 
        if (keyword === "logs") {
            connection.socket.emit(keyword, logData);
        } 
    }
}

//inner class that is the socket itself
function ConnectionSocket (socket) {
    this.socket = socket;
    this.position;
    this.addresses;
}
var id = Math.floor(Math.random()*1000);

var body = {
    "id": id
}

var body2 = {
    "id": id
}


var socket;

function requestInstance() {
    if (!socket) {
        socket = new WebSocket("/job", "protocolOne");

    }
    
}

function deleteCore() {
    $.ajax({
        url: '/v1/cores',
        type: 'DELETE',
        data: body2,
        success: function (result) {}
    });
}
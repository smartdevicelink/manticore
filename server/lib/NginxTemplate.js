module.exports = function () {
    return new NginxTemplate();
}

//function constructor for making nginx conf files
function NginxTemplate () {
    this.file = "";
}

NginxTemplate.prototype.get = function () {
    return this.file;
}

//make a new server block
NginxTemplate.prototype.server = function (port, isDefault, prefix, proxyAddr, isWebSocket) {
    var defaultString = "";
    if (isDefault) {
        defaultString = "default_server";
    }
    //if prefix exists, add a dot to the end of the string
    var prefixString = "";
    if (prefix) {
        prefixString = prefix + ".";
    }
    var serverString = `
server {
    listen ${port} ${defaultString};
    server_name ${prefixString}${process.env.DOMAIN_NAME};
    location / {`;

    this.file += serverString;

    serverString = `
        proxy_pass http://${proxyAddr};
`;
    this.file += serverString;
    //add extra proxy settings if using a websocket connection
    if (isWebSocket) {
        serverString = `
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
`;

        this.file += serverString;
    }
    //end the location block and the server block
    this.file += `
    }
}
`;

    return this;
}

//make a new server block for TCP routing
NginxTemplate.prototype.tcp = function (port, prefix, proxyAddr) {
    //if prefix exists, add a dot to the end of the string
    var prefixString = "";
    if (prefix) {
        prefixString = prefix + ".";
    }
    var serverString = `
server {
    listen 12345;
    proxy_pass ${proxyAddr};
`;
    this.file += serverString;

    //end the server block
    this.file += `
}
`;

    return this;
}
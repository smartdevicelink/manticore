const config = require('../../config.js');
const consul = require('../../interfaces/store/consul-kv/index.js');

module.exports = {
    "post-waiting-job-advance": async (ctx, next) => {
        if(ctx.currentRequest.state == 'claimed' && config.haproxyPort){
            let jsonObj = {
                users: []
            }
            let user = {};
            const id = ctx.currentRequest.id;
            const hmi = ctx.currentRequest.services.hmi;
            const core = ctx.currentRequest.services.core;
            user.tcp = {};
            user.http = [];
            user.tcp.address = core[`core-tcp-${id}`].internal;
            user.tcp.port = core[`core-tcp-${id}`].external;
            user.http.push({
                subdomain: core[`core-file-${id}`].external,
                address: core[`core-file-${id}`].internal
            });
            user.http.push({
                subdomain: core[`core-broker-${id}`].external,
                address: core[`core-broker-${id}`].internal
            });
            user.http.push({
                subdomain: core[`core-log-${id}`].external,
                address: core[`core-log-${id}`].internal
            });
            user.http.push({
                subdomain: hmi[`hmi-user-${id}`].external,
                address: hmi[`hmi-user-${id}`].internal
            });
            jsonObj.users.push(user);
            await consul.set({
                key: 'haproxy/mainPort',
                value: config.haproxyPort
            });
            await consul.set({
                key: 'haproxy/webAppAddresses',
                value: ctx.currentRequest.services.webAppAddresses
            });
            await consul.set({
                key: 'haproxy/domainName',
                value: config.domainName
            });
            await consul.set({
                key: 'templateData',
                value: JSON.stringify(jsonObj)
            });
        }
        next();
    }
};


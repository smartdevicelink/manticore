const config = require('../../config.js');
const {job, logger, store} = config;

module.exports = {
    "post-waiting-job-advance": async (ctx, next) => {
        if(ctx.currentRequest.state == 'claimed' && config.modes.haproxy){
            let jsonObj = {
                users: []
            }
            let user = {
                tcp: {},
                http: []
            };
            for(var service in ctx.currentRequest.services){
                for(var addressObj in ctx.currentRequest.services[service]){
                    if(ctx.currentRequest.services[service][addressObj].isHttp){
                        console.log(addressObj)
                        user.http.push({
                            subdomain: ctx.currentRequest.services[service][addressObj].external,
                            address: ctx.currentRequest.services[service][addressObj].internal
                        });
                    } else {
                        user.tcp = {
                            port: ctx.currentRequest.services[service][addressObj].external,
                            address: ctx.currentRequest.services[service][addressObj].internal
                        };
                    }
                }
            }
            jsonObj.users.push(user);
            await store.set({
                key: 'haproxy/mainPort',
                value: config.haproxyPort
            });
            await store.set({
                key: 'haproxy/webAppAddresses',
                value: ctx.currentRequest.services.webAppAddresses
            });
            await store.set({
                key: 'haproxy/domainName',
                value: config.haproxyDomain
            });
            await store.set({
                key: 'templateData',
                value: JSON.stringify(jsonObj)
            });
        }
        next();
    }
};


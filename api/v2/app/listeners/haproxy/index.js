// Copyright (c) 2018, Livio, Inc.
const config = require('../../config.js');
const {job, logger, store} = config;

module.exports = {
    "post-waiting-job-advance": async (ctx, next) => {
        if(config.modes.haproxy){
            const template = require('./HAProxyTemplate.js')();
            for(var id in ctx.waitingState){
                if(ctx.waitingState[id].state == 'claimed'){
                    template.addUser(id);
                    for(var service in ctx.waitingState[id].services){
                        for(var addressObj in ctx.waitingState[id].services[service]){
                            if(ctx.waitingState[id].services[service][addressObj].isHttp){
                                template.addHttpRoute(
                                    id,
                                    ctx.waitingState[id].services[service][addressObj].external, 
                                    ctx.waitingState[id].services[service][addressObj].internal
                                );
                            } else {
                                template.addTcpRoute(
                                    id,
                                    ctx.waitingState[id].services[service][addressObj].external,
                                    ctx.waitingState[id].services[service][addressObj].internal
                                );
                            }
                        }
                    }
                }
            }

            await store.set({
                key: 'haproxy/webAppAddresses',
                value: template.webAppAddresses
            });

            await store.set({
                key: 'templateData',
                value: JSON.stringify(template.kvFormat())
            });
        }
        next();
    },

    "startup": async (ctx, next) => {
        if (config.modes.haproxy) {
            await store.set({
                key: 'haproxy/domainName',
                value: config.haproxyDomain
            });

            await store.set({
                key: 'haproxy/mainPort',
                value: config.haproxyPort
            });
        }
        next();
    }
};


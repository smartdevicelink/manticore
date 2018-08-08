const config = require('../../config.js');
const {job, logger, store} = config;

const template = require('./HAProxyTemplate.js')()

module.exports = {
    "post-waiting-job-advance": async (ctx, next) => {
        if(ctx.currentRequest.state == 'claimed' && config.modes.haproxy){
            template.addUser(ctx.currentRequest.id);
            for(var service in ctx.currentRequest.services){
                for(var addressObj in ctx.currentRequest.services[service]){
                    if(ctx.currentRequest.services[service][addressObj].isHttp){
                        template.addHttpRoute(
                            ctx.currentRequest.id,
                            ctx.currentRequest.services[service][addressObj].external, 
                            ctx.currentRequest.services[service][addressObj].internal
                        );
                    } else {
                        template.addTcpRoute(
                            ctx.currentRequest.id,
                            ctx.currentRequest.services[service][addressObj].external,
                            ctx.currentRequest.services[service][addressObj].internal
                        );
                    }
                }
            }
            template.addWebAppAddress(ctx.currentRequest.services.webAppAddress);

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
        await store.set({
            key: 'haproxy/domainName',
            value: config.haproxyDomain
        });

        await store.set({
            key: 'haproxy/mainPort',
            value: config.haproxyPort
        });
        next();
    }
};


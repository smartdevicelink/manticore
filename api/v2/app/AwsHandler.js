// Copyright (c) 2018, Livio, Inc.
const AWS = require('aws-sdk');
const elb = new AWS.ELB();
const cloudWatch = new AWS.CloudWatch();
const config = require('./config.js')
const logger = config.logger;
const promisify = require('util').promisify;

module.exports = function(){
    return new AwsHandler();
}
/**
* Allows usage of the AWS SDK API
* @constructor
*/
function AwsHandler () {
    if (config.modes.aws) { //only do things if AWS is enabled
        AWS.config.update({region: config.awsRegion});
    }
}

//ELB CODE HERE
AwsHandler.prototype.changeState = async function (waitingState) {
    if (!config.modes.elb) {
        return; //do nothing if ELB isn't enabled
    }
    //get the current state
    const lbStatus = (await describeLoadBalancer()).LoadBalancerDescriptions[0];
    //get listener information
    var actualListeners = [];
    for (let i = 0; i < lbStatus.ListenerDescriptions.length; i++) {
        actualListeners.push(new Listener(lbStatus.ListenerDescriptions[i].Listener));
    }

    //first, find and remove all ports that don't need to be listened on anymore
    //then, find and add all ports that need to be listened on
    //port 443 should always be open for HTTPS connections
    //the websocket connection should always be open to whatever config.wsPort is

    const httpListener = new Listener({
        Protocol: "HTTP",
        LoadBalancerPort: 80,
        InstanceProtocol: "HTTP",
        InstancePort: config.haproxyPort,
    });
    const wsListener = new Listener({
        Protocol: "TCP",
        LoadBalancerPort: config.wsPort,
        InstanceProtocol: "TCP",
        InstancePort: config.haproxyPort,
    });

    if (config.modes.elbEncryptHttp) {
        httpListener.Protocol = "HTTPS";
        httpListener.LoadBalancerPort = 443;
        httpListener.SSLCertificateId = config.sslCertificateArn;
    }

    if (config.modes.elbEncryptWs) {
        wsListener.Protocol = "SSL";
        wsListener.SSLCertificateId = config.sslCertificateArn;
    }

    let expectedListeners = [httpListener, wsListener];

    for(var id in waitingState){
        if(waitingState[id].state == 'claimed'){
            for(var service in waitingState[id].services){
                for(var addressObj in waitingState[id].services[service]){
                    if(!waitingState[id].services[service][addressObj].isHttp){
                        const listener = new Listener({
                            Protocol: "TCP",
                            LoadBalancerPort: waitingState[id].services[service][addressObj].external,
                            InstanceProtocol: "TCP",
                            InstancePort: waitingState[id].services[service][addressObj].external
                        })

                        if (config.modes.elbEncryptTcp) {
                            listener.Protocol = "SSL";
                            listener.SSLCertificateId = config.sslCertificateArn;
                        }
    
                        expectedListeners.push(listener);
                    }
                }
            }
        }
    }
    //determine which listeners need to be added and which need to be removed
    var listenerChanges = calculateListenerChanges(expectedListeners, actualListeners);
    //ALWAYS remove unneeded listeners before adding needed listeners
    await promisify(removeListeners)(listenerChanges.toBeDeletedListeners);
    await promisify(addListeners)(listenerChanges.toBeAddedListeners);
}

/**
* Determines what the new state of the ELB listeners should be using differences. Static method
* @param {Listener} expectedListeners - The Listeners that should exist
* @param {Listener} actualListeners - What Listeners are currently on the ELB
* @returns {object} listenerChanges - Describes changes necessary to the ELB
* @returns {array} listenerChanges.toBeDeletedListeners - An array of port numbers to be removed from the ELB
* @returns {array} listenerChanges.toBeAddedListeners - An array of Listener objects to be added to the ELB
*/
function calculateListenerChanges (expectedListeners, actualListeners) {
    var listenerChanges = {
        toBeDeletedListeners: [], //NOTE: only save the LoadBalancer ports of the listeners here!
        toBeAddedListeners: []
    }
    //with some clever foresight, we won't need two sets of nested for loops to get
    //all the information we need
    //what is crucial about this algorithm is that the LoadBalancerPort number must be unique
    //across all other listeners in an array
    //sort the arrays in ascending order using the LoadBalancerPort as the comparing element
    expectedListeners.sort((a, b) => {
        return a.LoadBalancerPort - b.LoadBalancerPort;
    });
    actualListeners.sort((a, b) => {
        return a.LoadBalancerPort - b.LoadBalancerPort;
    });

    //require both arrays must contain elements for an investigation
    while (expectedListeners.length > 0 && actualListeners.length > 0) {
        //take the expected and current listener with the next lowest LB port number
        var expected = expectedListeners[0];
        var actual = actualListeners[0];
        var comparison = comparelistenerStates(expected, actual);
        if (comparison.diff < 0) {
            //an expected listener is missing. add expected listener into toBeAddedListeners
            listenerChanges.toBeAddedListeners.push(expectedListeners.shift());
        }
        else if (comparison.diff > 0) {
            //an actual listener needs to be removed. add listener's port to toBeDeletedListeners
            listenerChanges.toBeDeletedListeners.push(actualListeners.shift().LoadBalancerPort);
        }
        else {
            //LB ports of both listeners are equal.
            if (comparison.equivalent) {
                //matching listeners. do nothing to change the state
                expectedListeners.shift();
                actualListeners.shift();
            } else {
                //listeners do not match. we must update the listener with this port
                //remove actual listener and add expected listener
                listenerChanges.toBeAddedListeners.push(expectedListeners.shift());
                listenerChanges.toBeDeletedListeners.push(actualListeners.shift().LoadBalancerPort);
            }
        }
    }
    //one of the arrays are depleted
    //all remaining listeners in expected array need to be added
    //all remaining listeners in actual array need to be removed
    while (expectedListeners.length > 0) {
        listenerChanges.toBeAddedListeners.push(expectedListeners.shift());
    }
    while (actualListeners.length > 0) {
        listenerChanges.toBeDeletedListeners.push(actualListeners.shift().LoadBalancerPort);
    }
    //finally complete!
    return listenerChanges;
}

/**
* Determines whether two Listener objects are equivalent, and which listener LoadBalancer port is higher. Static method
* @param {Listener} listener1 - A Listener to compare against
* @param {Listener} listener2 - A Listener to compare against
* @returns {object} status - States the relationship between Listener objects
* @returns {boolean} status.equivalent - States whether the Listener objects are equivalent
* @returns {number} status.diff - The difference between two Listener objects' LoadBalancer ports
*/
function comparelistenerStates (listener1, listener2) {
    var status = {
        equivalent: true,
        diff: 0
    }
    status.diff = listener1.LoadBalancerPort - listener2.LoadBalancerPort;
    //most common check is if the LB port numbers are equivalent, so check that first
    if (listener1.LoadBalancerPort !== listener2.LoadBalancerPort
        || listener1.Protocol !== listener2.Protocol
        || listener1.InstanceProtocol !== listener2.InstanceProtocol
        || listener1.InstancePort !== listener2.InstancePort
        || listener1.SSLCertificateId !== listener2.SSLCertificateId) {
        status.equivalent = false;
    }
    return status;
}

/**
* Finds the current state of Listeners on the ELB
*/
async function describeLoadBalancer () {
    var params = {
        LoadBalancerNames: [config.elbName],
    }
    return promisify(elb.describeLoadBalancers.bind(elb))(params);
}

/*
 * Sets the idleTimeout for the Manticore load balancer
 */
AwsHandler.prototype.setElbTimeout = async function (timeout) {
    var params = {
        LoadBalancerAttributes: {
            ConnectionSettings: {
                IdleTimeout: timeout
            }
        },
        LoadBalancerName: config.elbName
    };
    await promisify(elb.modifyLoadBalancerAttributes.bind(elb))(params);
}

/**
 * @param {object} lbStatus - An AWS response object describing everything about the ELB
 */


/**
* Adds listeners to the ELB
* @param {array} listeners - An array of Listener objects
*/
function addListeners (listeners, callback) {
    var params = {
        Listeners: listeners,
        LoadBalancerName: config.elbName
    };
    if (listeners.length > 0) { //only make a call if listeners has data
        elb.createLoadBalancerListeners(params, (err, data) => {
            if (err) {
                logger.error(new Error(err).stack);
            }
            callback();
        });
    }
    else {
        callback();
    }
}

/**
* Removes listeners from the ELB
* @param {array} lbPorts - An array of numbers that are port numbers
*/
function removeListeners (lbPorts, callback) {
    var params = {
        LoadBalancerPorts: lbPorts,
        LoadBalancerName: config.elbName
    };
    if (lbPorts.length > 0) {
        elb.deleteLoadBalancerListeners(params, (err, data) => {
            if (err) {
                logger.error(new Error(err).stack);
            }
            callback();
        });
    }
    else {
        callback();
    }
}

/**
* Inner class that describes an ELB listener
* @constructor
* @param {object} body - The format of the data
* @param {string} body.Protocol - Protocol that is used for accepting public-facing traffic (ex. HTTPS, SSL)
* @param {number} body.LoadBalancerPort - The port that's opened for accepting public-facing traffic
* @param {string} body.InstanceProtocol - Protocol that is used for sending traffic internally (ex. HTTP, TCP)
* @param {number} body.InstancePort - The port that's opened for the sending traffic internally
* @param {string} body.SSLCertificateId - The ARN of the SSL certificate used for allowing HTTPS and SSL protocols
*/
function Listener (body) {
    this.Protocol = body.Protocol;
    this.LoadBalancerPort = body.LoadBalancerPort;
    this.InstanceProtocol = body.InstanceProtocol;
    this.InstancePort = body.InstancePort;
    this.SSLCertificateId = body.SSLCertificateId;
}

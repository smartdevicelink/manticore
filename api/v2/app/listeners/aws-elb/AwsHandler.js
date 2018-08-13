const AWS = require('aws-sdk');
const elb = new AWS.ELB();
const cloudWatch = new AWS.CloudWatch();
const config = require('../../config.js')
const {job, logger, store} = config;

module.exports = AwsHandler;

/**
* Allows usage of the AWS SDK API
* @constructor
*/
function AwsHandler () {}

/**
* Sets up AwsHandler with logging 
* @param {string} region - The AWS region to be used (ex. us-east-1)
* @param {winston.Logger} log - An instance of the logger to use
* @returns {AwsHandler} - An AwsHandler object
*/
AwsHandler.prototype.init = () => {
    if (config.modes.aws) { //only do things if AWS is enabled
        AWS.config.update({region: config.awsRegion});
    }
};

//ELB CODE HERE
AwsHandler.prototype.changeState = async (waitingState) => {
    if (!config.modes.elb) {
        return; //do nothing if ELB isn't enabled
    }
    var self = this; //consistent reference to 'this'
    //get the current state
    const lbStatus = await this.describeLoadBalancer();
    //get listener information
    var actualListeners = [];
    for (let i = 0; i < lbStatus.ListenerDescriptions.length; i++) {
        actualListeners.push(new Listener(lbStatus.ListenerDescriptions[i].Listener));
    }    

    //first, find and remove all ports that don't need to be listened on anymore
    //then, find and add all ports that need to be listened on
    //port 443 should always be open for HTTPS connections
    //the websocket connections should always be open to whatever ELB_SSL_PORT is         
    var expectedListeners = [new Listener({
        Protocol: "HTTPS",
        LoadBalancerPort: 443,
        InstanceProtocol: "HTTP",
        InstancePort: config.haproxyPort, 
        SSLCertificateId: config.sslCertificateArn
    }),
    new Listener({
        Protocol: "SSL",
        LoadBalancerPort: config.sslPort, 
        InstanceProtocol: "TCP",
        InstancePort: config.haproxyPort, 
        SSLCertificateId: config.sslCertificateArn
    })];

	for(var id in ctx.waitingState){
	    if(ctx.waitingState[id].state == 'claimed'){
	        for(var service in ctx.waitingState[id].services){
	            for(var addressObj in ctx.waitingState[id].services[service]){
	                if(!ctx.waitingState[id].services[service][addressObj].isHttp){
	                    expectedListeners.push(new Listener({
				            Protocol: "TCP",
				            LoadBalancerPort: waitingState.[id].services[service][addressObj].external,
				            InstanceProtocol: "TCP",
				            InstancePort: waitingState.[id].services[service][addressObj].external
				        }));
				    }
	            }
	        }
	    }
	}

    //determine which listeners need to be added and which need to be removed
    var listenerChanges = await AwsHandler.calculateListenerChanges(expectedListeners, actualListeners);
    //ALWAYS remove unneeded listeners before adding needed listeners
    await self.removeListeners(listenerChanges.toBeDeletedListeners);
    await self.addListeners(listenerChanges.toBeAddedListeners);
}

/**
* Determines what the new state of the ELB listeners should be using differences. Static method
* @param {Listener} expectedListeners - The Listeners that should exist
* @param {Listener} actualListeners - What Listeners are currently on the ELB
* @returns {object} listenerChanges - Describes changes necessary to the ELB
* @returns {array} listenerChanges.toBeDeletedListeners - An array of port numbers to be removed from the ELB
* @returns {array} listenerChanges.toBeAddedListeners - An array of Listener objects to be added to the ELB
*/
AwsHandler.calculateListenerChanges = async (expectedListeners, actualListeners) => {
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
        var comparison = AwsHandler.comparelistenerStates(expected, actual);
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
AwsHandler.comparelistenerStates = (listener1, listener2) => {
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
AwsHandler.prototype.describeLoadBalancer = () => {
    var params = {
        LoadBalancerNames: [config.manticoreName],
    }
    elb.describeLoadBalancers(params, function (err, data) {
        //check if we got the load balancer that was requested via env variable
        if (data && data.LoadBalancerDescriptions && data.LoadBalancerDescriptions[0]) {
            var lbStatus = data.LoadBalancerDescriptions[0];
            //lbStatus's ListenerDescriptions property describes open ports and stuff
            return lbStatus;
        }
    });
}
/**
 * @param {object} lbStatus - An AWS response object describing everything about the ELB
 */


/**
* Adds listeners to the ELB
* @param {array} listeners - An array of Listener objects
*/
AwsHandler.prototype.addListeners = async (listeners) => {
    var params = {
        Listeners: listeners,
        LoadBalancerName: config.manticoreName
    };
    if (listeners.length > 0) { //only make a call if listeners has data
        elb.createLoadBalancerListeners(params, (err, data) => {
            if (err) {
                logger.error(err);
            }
            return;
        });        
    }
    else {
        return;
    }
}

/**
* Removes listeners from the ELB
* @param {array} lbPorts - An array of numbers that are port numbers
*/
AwsHandler.prototype.removeListeners = async (lbPorts) => {
    var params = {
        LoadBalancerPorts: lbPorts,
        LoadBalancerName: config.manticoreName
    };
    if (lbPorts.length > 0) {
        elb.deleteLoadBalancerListeners(params, (err, data) => {
            if (err) {
                logger.error(err);
            }
            return;
        });        
    }
    else {
        return;
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
/**
* Transforms JSON into a matching format for AllocationData
* @param {object} body - JSON data
* @returns {AllocationData} - An AllocationData object
*/
module.exports = function(body){
  return new AllocationData(body)
}

/**
* Describes address and port information about the running processes 
* inside an sdl_core container and HMI container.
* @constructor
* @param {object} body - The format of the data
* @param {number} body.userPort - The port opened to the index.html of the HMI
* @param {number} body.brokerPort - The port opened to the sdl_broker
* @param {number} body.tcpPort - The port opened to sdl_core for TCP communication with an SDL app
* @param {string} body.coreAddress - The address to sdl_core
* @param {number} body.corePort - The port opened to sdl_core for websocket communication with the HMI
* @param {string} body.hmiAddress - The address to the HMI
* @param {number} body.hmiPort - ????
*/
function AllocationData (body) {
  if (body === undefined) {
    body = {};
  }
  this.userPort = body.userPort;
  this.brokerPort = body.brokerPort;
  this.tcpPort = body.tcpPort;
  this.coreAddress = body.coreAddress;
  this.corePort = body.corePort;
  this.hmiAddress = body.hmiAddress;
  this.hmiPort = body.hmiPort;
}

/**
* Transforms a stringified JSON into object data that matches the format of AllocationData
* @param {string} string - The stringified JSON
* @returns {AllocationData} - An AllocationData object
*/
AllocationData.prototype.parse = function (string){
  return new AllocationData(JSON.parse(string));
}
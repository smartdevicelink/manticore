module.exports = function(body){
  return new AllocationData(body)
}

function AllocationData(body){
  if(body === undefined){
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

//the inverse of the getString function
AllocationData.prototype.parse = function(string){
  return new AllocationData(JSON.parse(string));
}
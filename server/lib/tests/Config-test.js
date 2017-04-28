var mocha = require('mocha');
var assert = require('assert');

/**************************************************
These tests do not test the functions of Manticore,
but rather the logic of the configuration files****
property checks************************************
**************************************************/

//clear the cache of requiring the config for each test
beforeEach(function() {
  delete require.cache[require.resolve('./../config.js')];
});

describe('#configuration file', function(){
  it('should throw Error when NOMAD_IP_http is not set', function(){
    assert.throws(
      function(){
        require('./../config.js')
      },
      function(err) {
        if ( (err instanceof Error) && err.message == 'Necessary environment variables were not set. clientAgentIp must be defined') {
          return true;
        }
        return false
      }
    );
    
  })
  it('should disable JWT, HAProxy, and Trace when properties sent are empty', function(){
    let e = process.env // save process state
    process.env = {
      NOMAD_IP_http: 8
    },
    config = require('./../config.js')
    assert.strictEqual(config.jwt, undefined);
    assert.strictEqual(config.haproxy, undefined);
    assert.strictEqual(config.trace, undefined);
    process.env = e // return process.env to how it was before the test
  })
  it('should throw Error when some HAProxy properties are not set', function(){
    let options = {
      NOMAD_IP_http: 8,
      DOMAIN_NAME: 'Clarice'
    },
    e = process.env
    assert.throws(function(){
      process.env = options
      require('./../config.js')
    }, function(err){
      if ((err instanceof Error) && err.message == 'haproxy properties were not properly set'){
        return true
      }
    });
    process.env = e
  })
  it('should throw Error when some AWS ELB properties are not set', function(){
    let options = {
      NOMAD_IP_http: 8,
      DOMAIN_NAME: 'Clarice',
      TCP_PORT_RANGE_START: 0,
      TCP_PORT_RANGE_END: 57,
      HAPROXY_HTTP_LISTEN: true,
      ELB_MANTICORE_NAME:"manticore-elb",
      AWS_REGION: 'south'
    },
    e = process.env
    assert.throws(function(){
      process.env = options
      require('./../config.js')
    }, function(err){
      if ((err instanceof Error) && err.message == 'elb properties were not properly set'){
        return true
      }
    });
    process.env = e
  })
  it('should throw Error when some Trace properties are not set', function(){
    let options = {
      NOMAD_IP_http: 8,
      TRACE_API_KEY: 7
    },
    e = process.env
    assert.throws(function(){
      process.env = options
      require('./../config.js')
    }, function(err){
      if ((err instanceof Error) && err.message == 'trace properties were not properly set'){
        return true
      }
    });
    process.env = e
  })
})
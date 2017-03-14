var mocha = require('mocha');
var assert = require('assert');

/**************************************************
These tests do not test the functions of Manticore,
but rather the logic of the configuration files****
property checks************************************
**************************************************/


describe('#configuration file', function(){
  it('should throw Error when CLIENT_AGENT_IP is not set', function(){
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
    delete require.cache[require.resolve('./../config.js')]
  })
  it('should disable JWT, HAProxy, and Trace when properties sent are empty', function(){
    let e = process.env // save process state
    process.env = {
      CLIENT_AGENT_IP: 8
    },
    config = require('./../config.js')
    assert.strictEqual(config.jwt, undefined);
    assert.strictEqual(config.haproxy, undefined);
    assert.strictEqual(config.trace, undefined);
    delete require.cache[require.resolve('./../config.js')]
    process.env = e // return process.env to how it was before the test
  })
  it('should throw Error when some HAProxy properties are not set', function(){
    let options = {
      CLIENT_AGENT_IP: 8,
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
    delete require.cache[require.resolve('./../config.js')]
    process.env = e
  })
  it('should throw Error when some HAProxy ELB properties are not set', function(){
    let options = {
      CLIENT_AGENT_IP: 8,
      DOMAIN_NAME: 'Clarice',
      TCP_PORT_RANGE_START: 0,
      TCP_PORT_RANGE_END: 57,
      HAPROXY_HTTP_LISTEN: true,
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
    delete require.cache[require.resolve('./../config.js')]
    process.env = e
  })
  it('should throw Error when some Trace properties are not set', function(){
    let options = {
      CLIENT_AGENT_IP: 8,
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
    delete require.cache[require.resolve('./../config.js')]
    process.env = e
  })
})
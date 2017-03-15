//The authorative module for valid environment configuration
var e = process.env; //for less verbose typing

//any env vars that should be numbers should be converted to numbers
var config = {
  logLevel: e.NODE_LOGS || "DEBUG",
  clientAgentIp: e.CLIENT_AGENT_IP,
  httpPort: e.HTTP_PORT || 4000,
  cors: e.CORS || false,
  jwt: {
    secret: e.JWT_SECRET
  },
  trace: {
    serviceName: e.TRACE_SERVICE_NAME,
    apiKey: e.TRACE_API_KEY
  },
  haproxy: {
    domainName: e.DOMAIN_NAME,
    tcpPortRangeStart: e.TCP_PORT_RANGE_START,
    tcpPortRangeEnd: e.TCP_PORT_RANGE_END,
    httpListen: e.HAPROXY_HTTP_LISTEN,
    elb: {
      awsRegion: e.AWS_REGION,
      manticoreName: e.ELB_MANTICORE_NAME,
      sslPort: e.ELB_SSL_PORT,
      sslCertificateArn: e.SSL_CERTIFICATE_ARN
    }
  }
}

/**
* Tests that properties are properly set. Recursive function
* @param {object} obj - The config object used to check for validity, populated with environment variables
* @param {string} prop - The name of a property in the config that is an object for nested checking
* @returns {object} - A property inside config that is also an object
*/
function checkObj(obj, prop = 'config'){
  let arr = [], // array to hold properties that are objects to be checked only after all other properties have passed
    pass, // boolean to say whether last property passed check
    enable = true;  // boolean to say whether object has passed all previous checks so far
  for(var key in obj){ // Check each property in the object

    if(typeof obj[key] == 'object'){ // Check if property is an object
      arr.push(key) // Push the object to the array
    } else {

      if(typeof obj[key] == 'undefined'){ // Check if the key is undefined

        if(obj == config){ // Check if the undefined key is in the top level
          throw Error('Necessary environment variables were not set. ' + key + ' must be defined')
        } else {

          if(pass === true){  // if a previous property has passed, it has failed checks
            throw Error(prop + ' properties were not properly set')
          }

          pass = false;
          enable = false;
        }

      } else { // key is defined
        if(pass === false){ // if a previous property has failed, it has failed checks
          throw Error(prop + ' properties were not properly set')
        }
        pass = true;

      }
    }
  }

  if(enable){ // all checks have passed, feature enabled
    console.log('%s enabled', prop)

    // After all other checks have passed, check object properties
    for(var ele in arr){ // Loop through array of properties that were an object
      let key = arr[ele];
      obj[key] = checkObj(obj[key], key) // Call function to check properties of each object
    }

  } else { // disable the feature
    obj = undefined
    console.log('%s disabled', prop)
  }
  return obj
}

/**
* Modifies the config by coercing the environment variables with numbers to Numbers.
* @returns {object} - The config object
*/
function coerceToNumbers () {
  //we must do this last because doing it before the checking process means that the env vars
  //will not be undefined anymore which will cause issues with the checking process
  config.httpPort = Number(config.httpPort);
  if (config.haproxy) {
    config.haproxy.tcpPortRangeStart = Number(config.haproxy.tcpPortRangeStart);
    config.haproxy.tcpPortRangeEnd = Number(config.haproxy.tcpPortRangeEnd);
    config.haproxy.httpListen = Number(config.haproxy.httpListen);
    if (config.haproxy.elb) {
      config.haproxy.elb.sslPort = Number(config.haproxy.elb.sslPort);
    }
  }
  return config;
}

module.exports = coerceToNumbers(checkObj(config));
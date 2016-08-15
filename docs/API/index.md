## API
These are the valid endpoints to using Manticore

#### Request an SDL core
Method: POST

URL: /v1/cores

Body:
```
{
    "build": [ // an array of objects that modify the CMakeLists.txt file
        {"TIME_TESTER": "OFF"}
    ], 
    "branch": { // specifies which branch of sdl_core and sdl_hmi to use
        "hmi": "master",
        "core": "master"
    },
    "hmiName": "ford" // specifies which implementation of the HMI to use
}
```

Result: Create an SDL Core and corresponding HMI
```
{
    "hmiAddress": "127.0.0.1:3000", //address to point browser to in order to access HMI
    "appAddress": "127.0.0.1:12000", //address to point SDL app to in order to connect to core
    "id": 0123456789abcdef, //a unique identifier created for core
}
```

#### Get all valid HMIs
Method: GET

URL: /v1/hmis

Body: none

Result: Retrieve a list of all valid HMIs and their branches
```
{
    "hmis": [
        {
            "name": "ford",
            "branches": [
                "master",
                "develop"
            ]
        },
        {
            "name": "generic",
            "branches": [
                "master"
            ]
        }
    ]
}
```

#### Get all valid cores
Method: GET

URL: /v1/cores

Body: none

Result: Retrieve a list valid core branches
```
{
    "branches": [
        "master",
        "develop"
    ]
}
```

#### Get all valid build configurations
Method: GET

URL: /v1/builds

Body: none

Result: Retrieve a list of valid build configurations
```
{
    "build": [
        "TIME_TESTER",
        "BUILD_BT_SUPPORT"
    ]
}
```

#### Start an existing core
Method: GET

URL: /v1/cores/:id/start
-   id: unique identifier of core

Body: none

Result: Resume running an existing core and HMI
```
{
    "hmiAddress": "127.0.0.1:3000", //address to point browser to in order to access HMI
    "appAddress": "127.0.0.1:12000" //address to point SDL app to in order to connect to core
}
```

#### Delete an existing core
Method: DELETE

URL: /v1/cores/:id
-   id: unique identifier of core

Body: none

Result: Delete existing core and HMI
```
{
    "status": "OK"
}
```

#### Stop an existing core
Method: GET

URL: /v1/cores/:id/stop
-   id: unique identifier of core

Body: none

Result: Stop an existing core and HMI
```
{
    "status": "OK"
}
```
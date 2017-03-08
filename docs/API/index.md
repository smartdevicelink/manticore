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
    "hmiName": "ford", // specifies which implementation of the HMI to use
    "url": "" //a url that the server will hit to send TCP and HMI addresses
}
```

Result: The waiting time for address information is expected to take a long time, so another request using the url parameter in the body from the previous request is used to send the information back
```
Status code 200
```

Second request body:
```
{
    "hmiAddress": "127.0.0.1:3000", //address to point browser to in order to access HMI
    "appAddress": "127.0.0.1:12000", //address to point SDL app to in order to connect to core
    "id": 0123456789abcdef //a unique identifier created for core
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

#### Given an HMI, get all valid core branches for that HMI
Method: GET

URL: /v1/cores/:hmiName
-   hmiName: name associated with an HMI

Body: none

Result: Retrieve a list of valid core branches
```
{
    "branches": [
        "master",
        "develop"
    ]
}
```

#### Given a core branch, get all valid build configurations
Method: GET

URL: /v1/builds/:coreBranchName
-   coreBranchName: the name of the branch of sdl core to check

Body: none

Result: Retrieve a list of valid build configurations
```
{
    "builds": [
        "TIME_TESTER",
        "BUILD_BT_SUPPORT"
    ]
}
```

#### Delete an existing core
Method: DELETE

URL: /v1/cores/:id
-   id: unique identifier of core

Body: none

Result: Delete existing core and HMI
```
Status code 200
```
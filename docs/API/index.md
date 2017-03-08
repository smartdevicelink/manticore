## API
The documentation for the API uses Swagger to describe the endpoints. The swagger file for
Manticore's API is below.

```
swagger: '2.0'
info:
  title: Manticore API
  description: Manages sdl_core and HMI Docker containers in different environments
  version: "1.0.0"
basePath: /v1
produces:
  - application/json
paths:
  /cores:
    post:
      summary: Request Core
      description: |
        Sends a request to Manticore to be placed on a waiting list for
        receiving a sdl_core and HMI container. Additionally, a websocket server
        will start up for that specific user in order to receive connection
        information, sdl_core log streams, and the position in the waiting list
        in the future. The return value of this endpoint is the address that
        is used to connect to that websocket server.
      parameters: 
        - name: id
          in: query
          description: A unique identifier of a user. Required if JWT_SECRET is not set
          required: true
          type: string
      responses:
        200:
          description: A websocket url which is the url to receive information from
          schema:
            type: string
            description: The address of the websocket server
        400:
          description: A message stating what requirements weren't met in the query
          schema:
            type: string
            description: The error message
    delete:
      summary: Delete Core
      description: |
        Sends a request to Manticore to remove the user from the request list, and therefore
        the waiting list and shutdown any instances running for that user.
      parameters: 
        - name: id
          in: query
          description: A unique identifier of a user. Required if JWT_SECRET is not set
          required: true
          type: string
      responses:
        400:
          description: A message stating what requirements weren't met in the query
          schema:
            type: string
            description: The error message
  /logs:
    post:
      summary: Request Logs
      description: |
        Sends a request to Manticore to receive a log stream from sdl_core's log output.
        The output will go through the websocket connection that matches the url sent
        back to the user when they requested a sdl_core and HMI.
      parameters: 
        - name: id
          in: query
          description: A unique identifier of a user. Required if JWT_SECRET is not set
          required: true
          type: string
      responses:
        400:
          description: A message stating what requirements weren't met in the query
          schema:
            type: string
            description: The error message
```

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
/*
 * Copyright (c) 2019 Livio, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the
 * distribution.
 *
 * Neither the name of the Livio Inc. nor the names of its contributors
 * may be used to endorse or promote products derived from this software
 * without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

const ultimateTester = require('../ultimate-load-tester')
const WebSocket = require('ws')
const needle = require('needle')

function asyncNeedle (method) {
    return function () {
        const args = arguments
            return new Promise((resolve, reject) => {
            needle[method](...args, function (err, res) {
                if (err) reject(err)
                resolve(res.body)
            })
        })       
    }
}

function useDefaultJob (id, obj) {
    return {
        id: id,
        core: {
            version: obj.core.versions[0],
            build: obj.core.builds[0]
        },
        hmi: {
            type: obj.hmis[0].type,
            version: obj.hmis[0].versions[0]
        }
    }
}

module.exports = function (context) {
    let ws;
    let currentState = {}

    function teardown (config, resolve) { //close the ws connection and request to Manticore to delete the job
        const repeatTimer = setInterval(() => { //prevent this task from failing due to taking too long to complete
            context.reset()
        }, 1000)

        setTimeout(async () => { //keep the job for a bit before removing it
            await asyncNeedle('delete')(config.httpUrl, {id: config.id})
            currentState.status = "REMOVED JOB"
            context.update('id', currentState)
            clearInterval(repeatTimer)
            if (resolve) resolve() //done!
            if (ws) ws.terminate() //terminate here, since closing the connection earlier causes an error to be sent from this module
        }, 10000) //ten seconds 
    }

    return {
        start: function (config) {
            let startTime;

            //initiate ws connection
            return new Promise(async (resolve, reject) => {
                const jobObj = useDefaultJob(config.id, await asyncNeedle('get')(config.httpUrl))
                const wsConnectInfo = await asyncNeedle('post')(config.httpUrl, jobObj)

                if (wsConnectInfo && wsConnectInfo.error) {
                    context.stop("POST error")
                    return reject(wsConnectInfo.error)
                }

                currentState.id = config.id
                currentState.status = "CONNECTING"
                context.update('id', currentState)

                ws = new WebSocket(config.wsUrl + wsConnectInfo.passcode)

                ws.on('open', function () {
                    currentState.status = "CONNECTED"
                    context.update('id', currentState)
                });

                ws.on('message', function (data) {
                    context.reset()
                    const parsedData = JSON.parse(data)
                    if (parsedData.type === 'position' && parsedData.data.position === 0) { //front of the line
                        if (!startTime) startTime = new Date()
                    }
                    else if (parsedData.type === 'services') { //we have connection info!
                        currentState.status = "COMPLETED"
                        currentState.services = parsedData.data
                        currentState.totalTimeMs = new Date() - startTime
                        context.update('id', currentState)
                        return teardown(config, resolve) //don't resolve yet
                    }
                });

                ws.on('close', function (data) {
                    context.stop("Forcibly removed")
                    return reject()
                });
            })
        },
        stop: async function (config, message) { //prematurely stop this task
            teardown(config)
            context.update('id', {
                message: message,
                id: config.id
            })
        },
    }
}
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

const utils = require('./utils')

function startTaskPromise (config, index) {
    return new Promise((resolve, reject) => {
        let timeoutTimer;

        const context = {
            update: config.update,
            reset: resetTimeout,
            stop: () => {} //defined later on due to circular dependencies
        }

        function disableContext () { //for when the individualModule should stop
            context.update = () => {}
            context.reset = () => {}
            context.stop = () => {}
        }

        const individualInstance = config.individualModule(context)

        context.stop = (message) => individualInstance.stop(config.data, message)

        function resetTimeout () {
            clearTimeout(timeoutTimer)
            timeoutTimer = setTimeout(async () => { //took too long to respond. tell individualModule it's time to stop
                await individualInstance.stop(config.data, "Timeout reached")
                disableContext()
                resolve() //done
            }, config.timeoutMs)
        }

        //run the individual module after a delay
        let mainTimer = setTimeout(async () => {
            //start the timeout when the task starts
            resetTimeout()
            await individualInstance.start(config.data)
                .catch(err => console.error(new Error(err)))
            disableContext()
            clearTimeout(timeoutTimer)
            resolve() //done
        }, config.timeToExecute)
    })
}

module.exports = {
    start: async function (individualModule, aggregateModule) {
        const { count, spreadTimeMs, spreadExecute, timeoutMs, printIntervalMs, makeConfig, print } = aggregateModule()
        let printStats = {} 

        function update (uniqueProp, data) { //what the individualModule calls to update their status to print to the console
            const id = data[uniqueProp] //the value that's unique for each individualModule
            printStats[id] = data
        }

        //you can't run a map over just an empty initialized array...
        const configs = [...new Array(count)].map((_, index) => ({
            //space out the requests depending on spreadTimeMs
            timeToExecute: spreadExecute ? spreadExecute(index, count, spreadTimeMs) : utils.spread.simple(index, count, spreadTimeMs),
            timeoutMs: timeoutMs,
            update: update, 
            individualModule: individualModule,
            data: makeConfig(index)
        }))
        //start running things
        const clientPromises = configs.map((config, index) => startTaskPromise(config, index))

        const timer = setInterval(() => {
            print(printStats)
        }, printIntervalMs)

        await Promise.all(clientPromises)
        clearTimeout(timer);
        //print one last time
        print(printStats)
    }
}
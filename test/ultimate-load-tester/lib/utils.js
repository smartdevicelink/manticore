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
 
//useful functions for both aggregate and individual modules

module.exports = {
    // helper functions to change the spread of running tasks over time
    spread: { 
        //runs task on a near even distribution, from 0 ms to before spreadTimeMs
        simple: function (index, count, spreadTimeMs) {
            return (index/count)*spreadTimeMs
        },
        //runs tasks on an even distribution, from 0 ms but starting the last one exactly on spreadTimeMs
        full: function (index, count, spreadTimeMs) {
            return count === 1 ? 0 : (index/(count-1))*spreadTimeMs
        },
        //most requests run at the beginning
        highLoadStart: function (index, count, spreadTimeMs) {
            return (Math.pow(index, 2) / Math.pow(count, 2))*spreadTimeMs
        },
        //most requests run at the end
        highLoadEnd: function (index, count, spreadTimeMs) {
            return (Math.sqrt(index) / Math.sqrt(count))*spreadTimeMs
        }
    },
    // helper functions to change the format of the printing
    print: {
        //just prints everything out
        basic: function (stats) {
            console.log()
            for (let key in stats) {
                console.log(stats[key])
            }
        },
        //groups up similar property values together and counts how many there are of each
        basicGroup: function (groupBy) {
            return function (stats) {
                const grouped = {}
                for (let key in stats) {
                    const data = stats[key]
                    if (grouped[data[groupBy]] === undefined) grouped[data[groupBy]] = 0
                    grouped[data[groupBy]]++
                }
                let logged = []
                for (let key in grouped) {
                    logged.push(`${key}: ${grouped[key]}`)
                }
                console.log()
                console.log(logged.join(' - '))
            }
        },
        //computes basic statistical information based on numerical values of a property. groups values up by ranges, too
        intervalGroup: function (groupBy, partitionCount) {
            return function (stats) {
                let responseSum = 0;
                let responseMin = Infinity;
                let responseMax = -Infinity;

                const filteredStats = {}

                //values that are not numbers will not be counted towards the statistics. filter those out
                for (let key in stats) {
                    const data = stats[key]
                    if (!isNaN(data[groupBy])) filteredStats[key] = data
                }

                for (let key in filteredStats) {
                    const data = filteredStats[key]
                    responseSum += data[groupBy]
                    if (data[groupBy] < responseMin) responseMin = data[groupBy]
                    if (data[groupBy] > responseMax) responseMax = data[groupBy]
                }
                let averageValue = responseSum / Object.keys(filteredStats).length
                let partitions = partitionSplit(responseMin, responseMax, partitionCount)

                console.log()

                //statistics log
                console.log(`Min/Average/Max: ${responseMin}/${averageValue}/${responseMax}`)

                for (let key in filteredStats) {
                    const data = filteredStats[key]
                    const elem = partitions.find(partition => {
                        return data[groupBy] >= partition.min && data[groupBy] <= partition.max;
                    });
                    if (!elem.clientCount) elem.clientCount = 0;
                    elem.clientCount++;
                }

                //partition log
                for (let i = 0; i < partitions.length; i++) {
                    const data = partitions[i];
                    console.log(`${data.min}-${data.max}: ${data.clientCount}`);
                }
            }
        }
    }
}

//given a range and a number, divide the range into <count> partitions
function partitionSplit (min, max, count) {
    let partitions = [];
    const partitionSize = Math.floor((max - min) / count);
    for (let i = 0; i < count; i++) {
        let currentMin = min + partitionSize * i;
        //last partition should have max equal to parameter max
        let currentMax = currentMin + partitionSize - 1
        if (i === count - 1) {
            currentMax = max;
        }
        partitions.push({
            min: currentMin,
            max: currentMax
        });
    }
    return partitions;
}

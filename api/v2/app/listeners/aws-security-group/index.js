/*
 * Copyright (c) 2018 Livio, Inc.
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

const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();
const promisify = require('util').promisify;

const config = require('../../config.js');
const {job, logger, store} = config;

//set the region
if (config.modes.aws) {
    AWS.config.update({region: config.awsRegion});
}

//module that sets up the security group that allows access to Manticore's network through HAProxy and the ELB
module.exports = {
    "startup": async (ctx, next) => {
        if (config.modes.awsSecurityGroup) {
            //for the security group attached to the API machine

            //clear out all permissions for this security group
            const securityGroupsHaProxy = await getSecurityGroupInfo(config.awsHaproxyGroupId)
                .catch(err => logger.error(err));
            const removeGroupPromisesHaproxy = securityGroupsHaProxy.SecurityGroups.map(securityGroup => {
                if (securityGroup.IpPermissions.length === 0) { //no permissions!
                    return Promise.resolve();
                }
                const cleanedGroup = cleanSecurityGroup(securityGroup);
                return revokeSecurityGroupIngress(cleanedGroup);
            });

            await Promise.all(removeGroupPromisesHaproxy)
                .catch(err => logger.error(err));
            //insert a new security group using Manticore's environment settings
            //open up the port that leads to HAProxy
            //also open up the range of TCP ports possible on the API machines
            await authorizeSecurityGroupIngress(createSecurityGroupHaproxy())
                .catch(err => logger.error(err));


            //for the security group attached to the ELB

            //clear out all permissions for this security group
            const securityGroupsElb = await getSecurityGroupInfo(config.awsElbGroupId)
                .catch(err => logger.error(err));
            const removeGroupPromisesElb = securityGroupsElb.SecurityGroups.map(securityGroup => {
                if (securityGroup.IpPermissions.length === 0) { //no permissions!
                    return Promise.resolve();
                }
                const cleanedGroup = cleanSecurityGroup(securityGroup);
                return revokeSecurityGroupIngress(cleanedGroup);
            });

            await Promise.all(removeGroupPromisesElb)
                .catch(err => logger.error(err));
            //insert a new security group using Manticore's environment settings
            //open up the ports for HTTPS and SSL
            //also open up the range of TCP ports possible on the API machines
            await authorizeSecurityGroupIngress(createSecurityGroupElb())
                .catch(err => logger.error(err));            

        }
        next();
    }
};

async function getSecurityGroupInfo (groupId) {
    const params = {
        GroupIds: [groupId]
    };    
    return promisify(ec2.describeSecurityGroups.bind(ec2))(params);
}

async function revokeSecurityGroupIngress (params) {
    return promisify(ec2.revokeSecurityGroupIngress.bind(ec2))(params);
}

async function authorizeSecurityGroupIngress (params) {
    return promisify(ec2.authorizeSecurityGroupIngress.bind(ec2))(params);
}

//accepts a security group from AWS and reformats it for revoking those same IP permissions
function cleanSecurityGroup (group) {
    for (let i = 0; i < group.IpPermissions.length; i++) {
        group.IpPermissions[i] = {
            FromPort: group.IpPermissions[i].FromPort,
            IpProtocol: group.IpPermissions[i].IpProtocol,
            IpRanges: group.IpPermissions[i].IpRanges,
            Ipv6Ranges: group.IpPermissions[i].Ipv6Ranges,
            ToPort: group.IpPermissions[i].ToPort,
        }
    }
    return {
        IpPermissions: group.IpPermissions,
        GroupId: group.GroupId
    }
}

//uses the config object to create the JSON
function createSecurityGroupHaproxy () {
    return {
        "IpPermissions": [
            {
                "FromPort": config.haproxyPort,
                "IpProtocol": "tcp",
                "IpRanges": [
                    {
                        "CidrIp": "0.0.0.0/0"
                    }
                ],
                "Ipv6Ranges": [
                    {
                        "CidrIpv6": "::/0"
                    }
                ],
                "ToPort": config.haproxyPort
            },
            {
                "FromPort": config.tcpPortStart,
                "IpProtocol": "tcp",
                "IpRanges": [
                    {
                        "CidrIp": "0.0.0.0/0"
                    }
                ],
                "Ipv6Ranges": [
                    {
                        "CidrIpv6": "::/0"
                    }
                ],
                "ToPort": config.tcpPortEnd
            }
        ],
        "GroupId": config.awsHaproxyGroupId
    };
}

//uses the config object to create the JSON
function createSecurityGroupElb () {
    return {
        "IpPermissions": [
            {
                "FromPort": 443,
                "IpProtocol": "tcp",
                "IpRanges": [
                    {
                        "CidrIp": "0.0.0.0/0"
                    }
                ],
                "Ipv6Ranges": [
                    {
                        "CidrIpv6": "::/0"
                    }
                ],
                "ToPort": 443
            },
            {
                "FromPort": config.sslPort,
                "IpProtocol": "tcp",
                "IpRanges": [
                    {
                        "CidrIp": "0.0.0.0/0"
                    }
                ],
                "Ipv6Ranges": [
                    {
                        "CidrIpv6": "::/0"
                    }
                ],
                "ToPort": config.sslPort
            },
            {
                "FromPort": config.tcpPortStart,
                "IpProtocol": "tcp",
                "IpRanges": [
                    {
                        "CidrIp": "0.0.0.0/0"
                    }
                ],
                "Ipv6Ranges": [
                    {
                        "CidrIpv6": "::/0"
                    }
                ],
                "ToPort": config.tcpPortEnd
            }
        ],
        "GroupId": config.awsElbGroupId
    };
}
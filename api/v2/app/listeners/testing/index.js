const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();
const promisify = require('util').promisify;

const config = require('../../config.js');
const {job, logger, store} = config;

//set the region
if (config.modes.haproxy) {
    console.log(process.env.AWS_REGION);
    AWS.config.update({region: process.env.AWS_REGION});
}

//module that sets up the security group that allows access to Manticore's network through HAProxy
module.exports = {
    "startup": async (ctx, next) => {
        if (config.modes.haproxy) {
            //open up the port that leads to HAProxy
            //also open up the range of TCP ports possible on the API machines

            //clear out all permissions for this security group
            const securityGroups = await getSecurityGroupInfo();
            const removeGroupPromises = securityGroups.SecurityGroups.map(securityGroup => {
                const cleanedGroup = cleanSecurityGroup(securityGroup);
                console.log(JSON.stringify(cleanedGroup, null, 4));
                return revokeSecurityGroupIngress(cleanedGroup);
            });
            await Promise.all(removeGroupPromises);

        }
        next();
    }
};

async function getSecurityGroupInfo () {
    return new Promise((resolve, reject) => {
        const securityGroupId = process.env.AWS_HAPROXY_GROUP_ID;
        const params = {
            GroupIds: [securityGroupId]
        };
        ec2.describeSecurityGroups(params, function (err, data) {
            if (err) return reject(err);
            resolve(data);
        });        
    });
}

async function revokeSecurityGroupIngress (params) {
    return new Promise((resolve, reject) => {
        ec2.revokeSecurityGroupIngress(params, function (err, data) {
            console.log(err);
            console.log(JSON.stringify(data, null, 4));
            if (err) return reject(err);
            resolve(data);
        });        
    });
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

function createSecurityGroupObj () {
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
        "GroupId": process.env.AWS_HAPROXY_GROUP_ID
    }
}
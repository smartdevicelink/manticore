const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();
const promisify = require('util').promisify;

const config = require('../../config.js');
const {job, logger, store} = config;

//set the region
if (config.modes.aws) {
    AWS.config.update({region: config.awsRegion});
}

//module that sets up the security group that allows access to Manticore's network through HAProxy
module.exports = {
    "startup": async (ctx, next) => {
        if (config.modes.awsSecurityGroup) {

            //clear out all permissions for this security group
            const securityGroups = await getSecurityGroupInfo(config.awsHaproxyGroupId);
            const removeGroupPromises = securityGroups.SecurityGroups.map(securityGroup => {
                if (securityGroup.IpPermissions.length === 0) { //no permissions!
                    return Promise.resolve();
                }
                const cleanedGroup = cleanSecurityGroup(securityGroup);
                return revokeSecurityGroupIngress(cleanedGroup);
            });

            await Promise.all(removeGroupPromises);
            //insert a new security group using Manticore's environment settings
            //open up the port that leads to HAProxy
            //also open up the range of TCP ports possible on the API machines
            await authorizeSecurityGroupIngress(createSecurityGroupObj());
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
        "GroupId": config.awsHaproxyGroupId
    };
}
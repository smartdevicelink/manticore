// Copyright (c) 2018, Livio, Inc.
const config = require('../../../config.js');

//for dealing with circular dependency issues, export early
module.exports = config;

//interfaces. these are specific to the version of the app used so they go here
const storeModule = process.env.MODULE_STORE || 'consul-kv';
const jobModule = process.env.MODULE_JOB || 'manticore';
const loggerModule = process.env.MODULE_LOGGER || 'winston';
const wsModule = process.env.MODULE_WEBSOCKET || 'simple';

//inject module options into the config
config.logger = require(`./interfaces/logger/${loggerModule}`);
config.store = require(`./interfaces/store/${storeModule}`);
config.job = require(`./interfaces/job/${jobModule}`);
config.websocket = require(`./interfaces/websocket/${wsModule}`);
#!/usr/bin/env node

/*
 * (C) Copyright 2014 Travis Miller (http://raceconditions.net/).
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 */

var Server = require('../server.js');
var Arduino = require('../arduino.js');
var Config = require('../config.js');
var Db = require('../db.js');

var config = new Config().readConfiguration();

var log = function(level, message) {
    console.log(level + ": " + message);
    Db.saveEvent({'level': level, 'message': message});
};

process.on('uncaughtException', function(err) {
    log("EXCEPTION", err);
    if(err.errno === 'EADDRINUSE')
         log("ERROR", "An existing process is already listening on port " + config.port);
    else
         throw err;
    process.exit(1);
});

var server = new Server(config.port);
var arduino = new Arduino(config.device);

server.on('data', function(buffer) {
    arduino.write(buffer);
});

server.on('readsensors', function(buffer) {
    arduino.write(buffer);
});

arduino.on('data', function(buffer) {
    server.write(buffer);
});

arduino.on('serialready', function() {
    server.onSerialReady();
});

server.on("INFO", function(message) {
    log("INFO", message);
});

server.on("WARN", function(message) {
    log("WARN", message);
});

server.on("ERROR", function(message) {
    log("ERROR", message);
});

arduino.on("INFO", function(message) {
    log("INFO", message);
});

arduino.on("WARN", function(message) {
    log("WARN", message);
});

arduino.on("ERROR", function(message) {
    log("ERROR", message);
});

arduino.start();
server.start();

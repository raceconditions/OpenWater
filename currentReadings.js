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

var Arduino = require('./arduino.js');
var Config = require('./config.js');

var config = new Config().readConfiguration();

process.on('uncaughtException', function(err) {
    throw err;
    log("EXCEPTION", err);
    setTimeout(function(){process.exit(1)}, 1000);
});

var arduino = new Arduino(config.device);
arduino.on("INFO", function(message) {
    console.log("INFO", message);
});

arduino.on("WARN", function(message) {
    console.log("WARN", message);
});

arduino.on("ERROR", function(message) {
    console.log("ERROR", message);
});
var serialReady = false;

arduino.on('data', function(buffer) {
    console.log(buffer);
});

arduino.on('serialready', function() {
    console.log("Serial Ready");
    serialReady = true;
});

setInterval(function() {
    if(serialReady) {
        arduino.write('M5');
    }
}, 1000);


arduino.start();
console.log("Starting " + config.device);

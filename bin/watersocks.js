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

var Db = require('../db.js');
var Server = require('../server.js');
var Water = require('../water.js');
var Arduino = require('../arduino.js');
var Config = require('../config.js');

var config = new Config().readConfiguration();

var log = function(level, message) {
    console.log(level + ": " + message);
    Db.saveEvent({'level': level, 'message': message});
};

process.on('uncaughtException', function(err) {
    throw err;
    log("EXCEPTION", err);
    setTimeout(function(){process.exit(1)}, 1000);
});

var water = new Water(Db);
var server = new Server(config.port, water, Db);
var arduino = new Arduino(config.device);

server.on('data', function(buffer) {
    arduino.write(buffer);
});

arduino.on('data', function(buffer) {
    water.write(buffer);
});

arduino.on('serialready', function() {
    water.onSerialReady();
});

water.on('readsensors', function(buffer) {
    arduino.write(buffer);
});

water.on('watering', function(data) {
    server.onWatering(data);
});

water.on('toggle', function(bit) {
    server.onToggle(bit);
});

water.on('sensordata', function(data) {
    server.onSensorData(data);
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

water.on("INFO", function(message) {
    log("INFO", message);
});

water.on("WARN", function(message) {
    log("WARN", message);
});

water.on("ERROR", function(message) {
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
water.start();
server.start();

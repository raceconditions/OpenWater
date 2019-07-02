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

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Server = function(port, water, db) { 
    var http = require('http'),
        fs = require('fs'),
        index = fs.readFileSync(__dirname + '/index.html');

    var self = this;

    this.start = function () {
        app.listen(config.port);
        self.emit('INFO', 'Web server started. Listening on port ' + config.port);
    }; 

    this.stop = function() {
    };

    this.onWatering = function(data) {
        globalSocketEmit("watering", data);
    };

    this.onToggle = function(bit) {
        globalSocketEmit("toggle", bit);
    };

    this.onSensorData = function(data) {
        globalSocketEmit("sensordata", data);
    };

    this.onUserNotify = function(message) {
        globalSocketEmit("message", message);
    };
    
    var app = http.createServer(function(req, res) {
        if(req.url == "/") {
           res.writeHead(200, {'Content-Type': 'text/html'});
           res.end(index);
        } else if(req.url == "/data") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getSensorValues(d, function(data) {
               res.end(JSON.stringify(data));
           });
        } else if(req.url == "/watering") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getWaterings(d, function(data) {
               res.end(JSON.stringify(data));
           });
        } else if(req.url == "/events") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getEvents(d, function(data) {
               res.end(JSON.stringify(data));
           });
        } else if(req.url == "/config" && req.method == "GET") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           db.getConfig("master", function(data) {
               res.end(JSON.stringify(data));
           });
        } else if(req.url == "/solenoids" && req.method == "GET") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           var solenoids = water.getSolenoids(); 
           res.end(JSON.stringify(solenoids));
        } else if(req.url == "/moisture/last" && req.method == "GET") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           db.getLastSensorValue(function(sensors) {
               res.end(JSON.stringify(sensors));
           }); 
        } else if(/^\/open\/(\d+|all)\/time\/\d+/.test(req.url) && req.method == "GET") {
           var params = /^\/open\/(\d+|all)\/time\/(\d+)/g.exec(req.url);
           res.writeHead(200, {'Content-Type': 'application/json'});
           var pin = params[1];
           var timeToRun = params[2];
           if(pin.toLowerCase() == "all")
              water.openWater({timeToRun: timeToRun});           
           else
              water.openWater({timeToRun: timeToRun, pin: pin});           
           res.end();
        } else if(req.url == "/config" && req.method == "POST") {
           res.writeHead(200);
           var jsonString = '';
    
           req.on('data', function (data) {
               jsonString += data;
           });
    
           req.on('end', function () {
               var config = JSON.parse(jsonString);
               db.saveConfig(config.category, config);
               water.updateConfig(config);
               res.end();
           });
        } else if(req.url == "/findSensors" && req.method == "POST") {
           res.writeHead(200);
           var jsonString = '';

           req.on('data', function (data) {
               jsonString += data;
           });
           req.on('end', function () {
               var config = JSON.parse(jsonString);
               if(config.action == 'start') {
                   water.findWaterSensorsStart(config.pollingFrequency);
               } else {
                   water.findWaterSensorsStop();
               }
               res.end();
           });
        }
        else {
           res.writeHead(404);
           res.end();
        }
    });
    
    var io = require('socket.io').listen(app);

    io.on('connection', function(socket) {
        socket.on('toggle', water.toggle);
        socket.on('open', water.openWater);
        socket.on('close', water.closeWater);
    });

    var globalSocketEmit = function(topic, payload) {
        io.emit(topic, payload);
    }
};

util.inherits(Server, EventEmitter);

module.exports = Server;

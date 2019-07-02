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
    var express = require('express'),
        bodyParser = require('body-parser'),
        app = express(),
        server = require('http').Server(app)
        fs = require('fs'),
        index = fs.readFileSync(__dirname + '/index.html');

    var self = this;
    var server, io;

    app.use(bodyParser.json());

    this.start = function () {
        server = app.listen(port);
        io = require('socket.io').listen(server);
        setupIo();
        self.emit('INFO', 'Web server started. Listening on port ' + port);
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
   
    app.get('/', function(req, res) { 
           self.emit('INFO', "Web request on /");
           res.writeHead(200, {'Content-Type': 'text/html'});
           res.end(index);
    });

    app.get("/data", function(req, res) {
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getSensorValues(d, function(data) {
               res.json(data);
           });
    });
    app.get("/temperature", function(req, res) {
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getTemperatureValues(d, function(data) {
               res.json(data);
           });
    });
    app.get("/watering", function(req, res) {
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getWaterings(d, function(data) {
               res.json(data);
           });
    });
    app.get("/events", function(req, res) {
           var d = new Date();
           d.setDate(d.getDate() - 3);
           db.getEvents(d, function(data) {
               res.json(data);
           });
    });
    app.route("/config")
        .get(function(req, res) {
           db.getConfig("master", function(data) {
               res.json(data);
           });
        })
        .post(function(req, res) {
            var config = req.body;
            db.saveConfig(config.category, config);
            water.updateConfig(config);
            res.end();
        });

    app.post("/findSensors", function(req, res) {
        var config = req.body;
        if(config.action == 'start') {
            water.findWaterSensorsStart(config.pollingFrequency);
        } else {
            water.findWaterSensorsStop();
        }
        res.end();
    });


    app.get("/solenoids", function(req, res) {
           var solenoids = water.getSolenoids(); 
           res.json(solenoids);
    });

    app.get("/moisture/last", function(req, res) {
        db.getLastSensorValue(function(sensors) {
            res.json(sensors);
        }); 
    });

    app.get("/open/:solenoid/time/:millis", function(req, res) {
           var params = /^\/open\/(\d+|all)\/time\/(\d+)/g.exec(req.url);
           var pin = params[1];
           var timeToRun = params[2];
           if(pin.toLowerCase() == "all")
              water.openWater({timeToRun: timeToRun});           
           else
              water.openWater({timeToRun: timeToRun, pin: pin});           
           res.end();
    });
    var globalSocketEmit;
    
    var setupIo = function() {
        io.on('connection', function(socket) {
            socket.on('toggle', water.toggle);
            socket.on('open', water.openWater);
            socket.on('close', water.closeWater);
        });

        globalSocketEmit = function(topic, payload) {
            io.emit(topic, payload);
        }
    };
};

util.inherits(Server, EventEmitter);

module.exports = Server;

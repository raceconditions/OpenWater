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
var Db = require('./db.js');
var masterConfig;
var serialReady = false;
var configReady = false;
var sensorPolling;

var Server = function(port) {
    var http = require('http'),
        fs = require('fs'),
        gpio = require('rpi-gpio');
        index = fs.readFileSync(__dirname + '/index.html');
    
    var MAX_TIME_TO_RUN = 600000; //10 minutes
    var ctrlPin = { pin: '16', gpio: '23', on: false };
    gpio.setup(16, gpio.DIR_OUT);
    var waterOn = false;
    var globalSocket;
    var maxTimer;
    var isWatering = false;

    var self = this;

    var startPolling = function() {
        if(serialReady && configReady) {
             clearInterval(sensorPolling);
             sensorPolling = setInterval(function(){self.emit("readsensors", "M" + masterConfig.sensorCount)}, masterConfig.sensorPollingFrequency);
        }
    }
    
    var getConfig = function() {
        Db.getConfig("master", function(data) {
            masterConfig = data;
            if(data != null) {
               configReady = true;
               startPolling();
            } else {
               getConfig();
            }
        });
    }
    getConfig();
    
    var app = http.createServer(function(req, res) {
        if(req.url == "/") {
           res.writeHead(200, {'Content-Type': 'text/html'});
           res.end(index);
        } else if(req.url == "/data") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           var d = new Date();
           d.setDate(d.getDate() - 3);
           Db.getSensorValues(d, function(data) {
               res.end(JSON.stringify(data));
           });
        } else if(req.url == "/watering") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           var d = new Date();
           d.setDate(d.getDate() - 3);
           Db.getWaterings(d, function(data) {
               res.end(JSON.stringify(data));
           });
        } else if(req.url == "/config" && req.method == "GET") {
           res.writeHead(200, {'Content-Type': 'application/json'});
           res.end(JSON.stringify(masterConfig));
        } else if(req.url == "/config" && req.method == "POST") {
           res.writeHead(200);
           var jsonString = '';
    
           req.on('data', function (data) {
               jsonString += data;
           });
    
           req.on('end', function () {
               masterConfig = JSON.parse(jsonString);
               Db.saveConfig(masterConfig.category, masterConfig);
               startPolling();
               res.end();
           });
        }
    });
    
    var io = require('socket.io').listen(app);

    this.start = function () {
        app.listen(config.port);
        console.log('listening on port ' + config.port);
    };

    this.stop = function() {
    };

    this.write = function(buffer) {
        var dataSet = {date: new Date()};
        var sensorValues = [];
	var bufferData = buffer.toString('utf8').trim();
	if(bufferData.charAt(0) == "M") {
            var sensors = bufferData.split(/\r\n/);
            for(var i = 0; i < sensors.length; i++) {
               var moistureInfo = sensors[i].split(":");
	       var sensor = moistureInfo[1];
	       var value = 100 - parseInt(moistureInfo[2]);
               dataSet["moistureValue" + sensor] = value;
               sensorValues.push(value);
            }
            Db.saveSensorValues(dataSet);
            dataSet.createdAt = new Date();
            globalSocketEmit("sensor", dataSet);
            checkWateringThreshold(sensorValues);
        }
    };

    this.onSerialReady = function() {
        serialReady = true;
        startPolling(); 
    }

    var checkWateringThreshold = function(sensorValues) {
        if(isWatering)
            return;
        var total = 0;
        for(var i = 0; i < sensorValues.length; i++) {
            total += sensorValues[i];
        }
        var avgMoisture = total/sensorValues.length;
        Db.getLastWatering(function(lastWatering) {  
           var now = Date.now();
           if(masterConfig.autoWatering && avgMoisture <= masterConfig.autoWateringThreshold) {
               var nextAllowableWateringTime;
               if(lastWatering != null)
                   nextAllowableWateringTime = new Date(lastWatering.wateringStartTime.getTime() + masterConfig.autoWateringIntervalWaitTime);
               console.log("Watering based on average moisture of " + avgMoisture + " below watering threshold of " + masterConfig.autoWateringThreshold);
               if(lastWatering == null || nextAllowableWateringTime.getTime() <= now) {
                   console.log("Watering for " + (masterConfig.autoWateringDuration / 1000) + " seconds");
                   openWater({timeToRun: masterConfig.autoWateringDuration});
               } else {
                   console.log("Automatic watering cannot begin until " + nextAllowableWateringTime);
               }
           }
        });
    }

    var toggle = function() {
       if(ctrlPin.on) {
          ctrlPin.on = false;
          switchWater(ctrlPin.pin, false);
       } else {
          globalSocketEmit('message', "Running water for unlimited time");
          ctrlPin.on = true;
          switchWater(ctrlPin.pin, true);
       }
    };
    
    var openWater = function(data) {
       switchWater(ctrlPin.pin, true);
       ctrlPin.on = true;
       globalSocketEmit('message', "Running water for " + (data.timeToRun / 1000) + " seconds");
       setTimeout(function() {
          switchWater(ctrlPin.pin, false);
          ctrlPin.on = false;
       }, data.timeToRun);
    }
    
    var closeWater = function() {
       switchWater(ctrlPin.pin, false);
       ctrlPin.on = false;
    }
    
    var wateringStartTime;
    var switchWater = function(pin, bit) {
            isWatering = bit;
//          gpio.write(pin, bit, function(err) {
//            if (err) {
//               globalSocketEmit('errorMessage', err);
//               throw err;
//            }
            if(bit) {
               wateringStartTime = new Date();
               setSafetyTimeout();
            } else {
               var wateringEndTime = new Date();
               var dataPoint = {wateringStartTime: wateringStartTime, duration: ((wateringEndTime.getTime() - wateringStartTime.getTime())/1000)};
               Db.saveWatering(dataPoint);
               globalSocketEmit("watering", dataPoint); 
               clearSafetyTimeout();
            }
            globalSocketEmit('toggle', bit ? "Turn Water Off" : "Turn Water On");
            globalSocketEmit('message', (bit ? "Opened" : "Closed") + " water valve");
            console.log((bit ? "Opened" : "Closed") + " water valve");
//          });
    };
    
    var setSafetyTimeout = function() {
       maxTimer = setTimeout(function() {
          switchWater(ctrlPin.pin, false);
          ctrlPin.on = false;
          globalSocketEmit('errorMessage', "Safety timeout of " + (MAX_TIME_TO_RUN / 1000) + " seconds was reached");
          console.log("Safety timeout of " + (MAX_TIME_TO_RUN / 1000) + " seconds was reached");
       }, MAX_TIME_TO_RUN);
    };
    
    var clearSafetyTimeout = function() {
       clearTimeout(maxTimer);
    };

    var globalSocketEmit = function(topic, payload) {
       if(globalSocket == undefined) {
          setTimeout(function(){ globalSocketEmit(topic, payload); }, 200);
       } else {
          globalSocket.emit(topic, payload);
       }
    }

    io.on('connection', function(socket) {
        globalSocket = socket;
        socket.on('toggle', toggle);
        socket.on('open', openWater);
        socket.on('close', closeWater);
    });
};

util.inherits(Server, EventEmitter);

module.exports = Server;

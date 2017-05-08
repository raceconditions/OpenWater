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
var Solenoid = require('./solenoid.js');
var stats = require("stats-lite");

/* 
  EMITS EVENTS: 
    watering
    toggle
    sensordata
    readsensors
    INFO/WARN/ERROR
*/
var Water = function(db) {
    var gpio = require('rpi-gpio');
    
    var MAX_TIME_TO_RUN = 600000; //10 minutes
    var masterConfig;
    var serialReady = false;
    var configReady = false;
    var sensorPolling;
    var wateringStartTime;
    var solenoids = [];
    var solenoidPins = [
      {pin: '16', name: 'Right', gpio: '23'},
      {pin: '18', name: 'Left', gpio: '24'}
    ];

    var self = this;

    this.start = function() {
        getConfig();

        for(var i = 0; i < solenoidPins.length; i++) {
           thisSolenoid = new Solenoid(db, solenoidPins[i].pin);
           solenoids[solenoidPins[i].pin] = thisSolenoid;
           setupSolenoid(thisSolenoid);
        }
    }

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
            db.saveSensorValues(dataSet);
            dataSet.createdAt = new Date();
            self.emit("sensordata", dataSet);
            checkWateringThreshold(sensorValues);
        }
    };

    this.onSerialReady = function() {
        serialReady = true;
        startPolling(); 
    }

    this.toggle = function(data) {
       if(data.pin) {
          solenoids[data.pin].toggle(data);
       } else {
          for(var i = 0; i < solenoidPins.length; i++) {
             solenoids[solenoidPins[i].pin].toggle(data);
          }
       }
    };
    
    this.openWater = function(data) {
       if(data.pin) {
          solenoids[data.pin].openWater(data);
       } else {
          for(var i = 0; i < solenoidPins.length; i++) {
             solenoids[solenoidPins[i].pin].openWater(data);
          }
       }
    }
    
    this.closeWater = function() {
       if(data.pin) {
          solenoids[data.pin].closeWater(data);
       } else {
          for(var i = 0; i < solenoidPins.length; i++) {
             solenoids[solenoidPins[i].pin].closeWater(data);
          }
       }
    }

    this.updateConfig = function(config) {
       masterConfig = config;
       startPolling();
    }
 
    this.getSolenoids = function() {
       return solenoidPins;
    }

    var setupSolenoid = function(solenoid) {
       solenoid.start();
       solenoid.on("INFO", function(data) { self.emit("INFO", data); });    
       solenoid.on("WARN", function(data) { self.emit("WARN", data); });
       solenoid.on("ERROR", function(data) { self.emit("ERROR", data); });    
       solenoid.on("toggle", function(data) { self.emit("toggle", data); });    
       solenoid.on("watering", function(data) { self.emit("watering", data); });    
    }

    var anySolenoidsAreWatering = function() {
       var watering = false;
       for(var i = 0; i < solenoidPins.length; i++) {
          if(solenoids[solenoidPins[i].pin].isWatering())
             watering = true;
       }
       return watering;
    }
 
    var checkWateringThreshold = function(sensorValues) {
        if(anySolenoidsAreWatering()) {
            self.emit("WARN", "Automatic watering will not start. Water is already started.");
            return;
        }
        var madMean = getAverageWithoutOutliers(sensorValues);
        var avgMoisture = madMean.mean;
        db.getLastWatering(function(lastWatering) {  
           var now = Date.now();
           if(masterConfig.autoWatering && avgMoisture <= masterConfig.autoWateringThreshold) {
               var nextAllowableWateringTime;
               if(lastWatering != null)
                   nextAllowableWateringTime = new Date(lastWatering.wateringStartTime.getTime() + masterConfig.autoWateringIntervalWaitTime);
               self.emit("INFO", "Watering recommended beased on average moisture of " + avgMoisture + " below watering threshold of " + masterConfig.autoWateringThreshold);
               if(madMean.outliers.length > 0)
                   self.emit("INFO", "Detected and ignored outliers in data set: " + madMean.outliers);
               if(lastWatering == null || nextAllowableWateringTime.getTime() <= now) {
                   self.emit("INFO", "Watering for " + (masterConfig.autoWateringDuration / 1000) + " seconds");
                   self.openWater({timeToRun: masterConfig.autoWateringDuration});
               } else {
                   self.emit("WARN", "Automatic watering will not start. Cannot start automatic watering until " + nextAllowableWateringTime);
               }
           }
        });
    }

    var getAverageWithoutOutliers = function(array) {
        var outliers = [];
        var resultSet = [];

        var median = stats.median(array);
        var mad = stats.median(array.map(function(num) {
            return Math.abs(num - median);
        }));

        for(var i = 0; i < array.length; i++) {
            if(array[i] < median - mad || array[i] > median + mad) {
               outliers.push(array[i]);
            } else {
               resultSet.push(array[i]);
            }
        }
        return {mean: stats.mean(resultSet), outliers: outliers};
    }

    var startPolling = function() {
        if(serialReady && configReady) {
             clearInterval(sensorPolling);
             sensorPolling = setInterval(function(){self.emit("readsensors", "M" + masterConfig.sensorCount)}, masterConfig.sensorPollingFrequency);
        }
    }
    
    var getConfig = function() {
        db.getConfig("master", function(data) {
            masterConfig = data;
            if(data != null) {
               configReady = true;
               startPolling();
            } else {
               getConfig();
            }
        });
    }

};

util.inherits(Water, EventEmitter);

module.exports = Water;

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
    var ctrlPin = { pin: '16', gpio: '23', on: false };
    var waterOn = false;
    var maxTimer;
    var masterConfig;
    var serialReady = false;
    var configReady = false;
    var sensorPolling;
    var isWatering = false;
    var wateringStartTime;

    var self = this;

    this.start = function() {
        getConfig();
        gpio.setup(16, gpio.DIR_OUT);
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

    this.toggle = function() {
       if(ctrlPin.on) {
          ctrlPin.on = false;
          self.emit('INFO', "User triggered watering stop.");
          switchWater(ctrlPin.pin, false);
       } else {
          self.emit('INFO', "User triggered watering start.");
          ctrlPin.on = true;
          switchWater(ctrlPin.pin, true);
       }
    };
    
    this.openWater = function(data) {
       switchWater(ctrlPin.pin, true);
       ctrlPin.on = true;
       self.emit("INFO", "Running water for " + (data.timeToRun / 1000) + " seconds");
       setTimeout(function() {
          switchWater(ctrlPin.pin, false);
          ctrlPin.on = false;
       }, data.timeToRun);
    }
    
    this.closeWater = function() {
       switchWater(ctrlPin.pin, false);
       ctrlPin.on = false;
    }

    this.updateConfig = function(config) {
       masterConfig = config;
       startPolling();
    }
 
    var checkWateringThreshold = function(sensorValues) {
        if(isWatering) {
            self.emit("WARN", "Automatic watering will not start. Water is already started.");
            return;
        }
        var total = 0;
        for(var i = 0; i < sensorValues.length; i++) {
            total += sensorValues[i];
        }
        var avgMoisture = total/sensorValues.length;
        db.getLastWatering(function(lastWatering) {  
           var now = Date.now();
           if(masterConfig.autoWatering && avgMoisture <= masterConfig.autoWateringThreshold) {
               var nextAllowableWateringTime;
               if(lastWatering != null)
                   nextAllowableWateringTime = new Date(lastWatering.wateringStartTime.getTime() + masterConfig.autoWateringIntervalWaitTime);
               self.emit("INFO", "Watering based on average moisture of " + avgMoisture + " below watering threshold of " + masterConfig.autoWateringThreshold);
               if(lastWatering == null || nextAllowableWateringTime.getTime() <= now) {
                   self.emit("INFO", "Watering for " + (masterConfig.autoWateringDuration / 1000) + " seconds");
                   openWater({timeToRun: masterConfig.autoWateringDuration});
               } else {
                   self.emit("WARN", "Automatic watering will not start. Cannot start automatic watering until " + nextAllowableWateringTime);
               }
           }
        });
    }
   
    var switchWater = function(pin, bit) {
          isWatering = bit;
          gpio.write(pin, bit, function(err) {
            if (err) {
               self.emit("ERROR", "FAILED to write to GPIO pin: " + err);
               throw err;
            }
            if(bit) {
               wateringStartTime = new Date();
               setSafetyTimeout();
            } else {
               var wateringEndTime = new Date();
               var dataPoint = {wateringStartTime: wateringStartTime, duration: ((wateringEndTime.getTime() - wateringStartTime.getTime())/1000)};
               db.saveWatering(dataPoint);
               self.emit("watering", dataPoint); 
               clearSafetyTimeout();
            }
            self.emit('toggle', bit);
            self.emit("INFO", (bit ? "Opened" : "Closed") + " water valve");
          });
    };
    
    var setSafetyTimeout = function() {
       maxTimer = setTimeout(function() {
          switchWater(ctrlPin.pin, false);
          ctrlPin.on = false;
          self.emit("WARN", "Safety timeout of " + (MAX_TIME_TO_RUN / 1000) + " seconds was reached");
       }, MAX_TIME_TO_RUN);
    };
    
    var clearSafetyTimeout = function() {
       clearTimeout(maxTimer);
    };

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

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
    INFO/WARN/ERROR
*/
var Solenoid = function(db, pin) {
    var gpio = require('rpi-gpio');
    
    var MAX_TIME_TO_RUN = 600000; //10 minutes
    var ctrlPin = { pin: pin, on: false };
    var waterOn = false;
    var maxTimer;
    var isWatering = false;
    var wateringStartTime;

    var self = this;

    this.start = function() {
        gpio.setup(ctrlPin.pin, gpio.DIR_OUT);
    }

    this.isWatering = function() {
        return isWatering;
    }

    this.toggle = function() {
       if(ctrlPin.on) {
          ctrlPin.on = false;
          self.emit('INFO', "User triggered watering stop on solenoid " + pin);
          switchWater(ctrlPin.pin, false);
       } else {
          self.emit('INFO', "User triggered watering start on solenoid " + pin);
          ctrlPin.on = true;
          switchWater(ctrlPin.pin, true);
       }
    };
    
    this.openWater = function(data) {
       switchWater(ctrlPin.pin, true);
       ctrlPin.on = true;
       self.emit("INFO", "Running water for " + (data.timeToRun / 1000) + " seconds on solenoid " + pin);
       setTimeout(function() {
          switchWater(ctrlPin.pin, false);
          ctrlPin.on = false;
       }, data.timeToRun);
    }
    
    this.closeWater = function() {
       switchWater(ctrlPin.pin, false);
       ctrlPin.on = false;
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
               var dataPoint = {wateringStartTime: wateringStartTime, duration: ((wateringEndTime.getTime() - wateringStartTime.getTime())/1000), solenoid: pin};
               db.saveWatering(dataPoint);
               self.emit("watering", dataPoint); 
               clearSafetyTimeout();
            }
            self.emit('toggle', bit);
            self.emit("INFO", (bit ? "Opened" : "Closed") + " water valve on solenoid " + pin);
          });
    };
    
    var setSafetyTimeout = function() {
       maxTimer = setTimeout(function() {
          switchWater(ctrlPin.pin, false);
          ctrlPin.on = false;
          self.emit("WARN", "Safety timeout of " + (MAX_TIME_TO_RUN / 1000) + " seconds was reached on solenoid " + pin);
       }, MAX_TIME_TO_RUN);
    };
    
    var clearSafetyTimeout = function() {
       clearTimeout(maxTimer);
    };
  
};

util.inherits(Solenoid, EventEmitter);

module.exports = Solenoid;

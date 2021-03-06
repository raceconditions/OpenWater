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
var serialport = require('serialport');

var Arduino = function(device) {

    var self = this;
    self.lastCommand = '';

    var serialDevice = new serialport(device, {
	baudrate: 9600,
	parser: serialport.parsers.readline("#"),
        autoOpen: false
    });

    this.start = function() {
        serialDevice.open(function (err) {
            if(err == null) {
                self.emit("INFO", 'OPENED serial connection to device: ' + device);
                self.emit('serialready');
            } else {
                self.emit("ERROR", 'FAILED to open serial connection:', err);
                setTimeout(this.start, 5000);
            }
        });

	serialDevice.on('data', function(buffer){
		self.emit('data', buffer);
	});
    };

    this.stop = function() {
	serialDevice.close(function() {
	    self.emit("INFO", 'CLOSED serial connection to device:', device);
	});
    };

    this.write = function(buffer) {
	serialDevice.write(buffer, function(err){
	    if(err != undefined) {
		self.emit("ERROR", 'FAILED to write to serial device:', err);
            }
	});
    };

};

util.inherits(Arduino, EventEmitter);

module.exports = Arduino;

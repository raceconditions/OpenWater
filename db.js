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

var Datastore = require('nedb');

var Db = function() {

    var self = this;
    var db = {};
    db.moisture = new Datastore({ filename: 'moisture.db', autoload: true, timestampData: true }),
    db.watering = new Datastore({ filename: 'watering.db', autoload: true, timestampData: true }),
    db.config = new Datastore({ filename: 'config.db', autoload: true, timestampData: true });

    db.config.find({category: "master"}, function(err, docs) {
        if(docs.length < 1) { console.log("seeding");
            db.config.insert({
                category: "master",
                sensorCount: 5, 
                sensorPollingFrequency: 1800000, 
                autoWatering: true, 
                autoWateringThreshold: 75, 
                autoWateringDuration: 60000
            });
        }
    });

    this.saveConfig = function(category, config) {
        console.log("Category: " + category);
        console.log(config);
        db.config.update({category: category}, config, {}, function (err, numReplaced) {
        console.log("Updated: " + numReplaced);
    })};

    this.getConfig = function(category, callback) {
        db.config.findOne({category: category}, function(err, docs) {
            return callback(docs);
        });
    };

    this.saveSensorValues = function(dataPoint) {
        db.moisture.insert(dataPoint);
    };

    this.getSensorValues = function(pointCount, callback) {
        db.moisture.find({}).sort({createdAt: 1}).limit(pointCount).exec(function(err, docs) {
             return callback(docs);
        });
    };

    this.saveWatering = function(data) {
        db.watering.insert(data);
    };

    this.getWaterings = function(date, callback) {
        db.watering.find({createdAt: {$gte: date.toISOString()}}).sort({createdAt: 1}).exec(function(err, docs) {
             return callback(docs);
        });
    };
};

module.exports = new Db();

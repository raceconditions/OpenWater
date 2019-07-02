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
    db.moisture = new Datastore({ filename: 'data/moisture.db.old', autoload: true, timestampData: true });
//    db.watering = new Datastore({ filename: 'data/watering.db', autoload: true, timestampData: true });
//    db.config = new Datastore({ filename: 'data/config.db', autoload: true, timestampData: true });
//    db.events = new Datastore({ filename: 'data/events.db', autoload: true, timestampData: true });

    this.setIndexes = function() {
        db.moisture.ensureIndex({fieldName:'createdAt'}, function(err) {
             console.log(err);
        });
    };

    this.purgeSensorValuesOlderThan = function(date, callback) {
        db.moisture.find({createdAt: {$gte: date}}).sort({createdAt: 1}).exec(function(err, docs) {
             return callback(docs);
        });
    };

    this.purgeWateringsOlderThan = function(date, callback) {
        db.watering.find({createdAt: {$gte: date}}).sort({createdAt: 1}).exec(function(err, docs) {
             return callback(docs);
        });
    };

    this.purgeEventsOlderThan = function(date, callback) {
        db.events.find({createdAt: {$gte: date}}).sort({createdAt: 1}).exec(function(err, docs) {
             return callback(docs);
        });
    };

};

module.exports = new Db();

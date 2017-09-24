/*
db.js

Copyright (C) 2016  Alexei Frolov, Larry Zhang
Developed at University of Toronto

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var Db = require('mongodb').Db;
var Server = require('mongodb').Server;
var logger = require('./log.js').logger;
var bcrypt = require('bcryptjs');

var DB_HOST = process.env.DB_HOST || 'localhost';
var DB_PORT = process.env.DB_PORT || 27017;
var DB_NAME = process.env.DB_NAME || 'quizzard';

var db = new Db(DB_NAME, new Server(DB_HOST, DB_PORT));

/* the field to sort by */
var sortTypes = Object.freeze({
    SORT_NOSORT:     0x0,
    SORT_DEFAULT:    0x1,
    SORT_RANDOM:     0x2,
    SORT_TOPIC:      0x4,
    SORT_POINTS:     0x8,
    QUERY_ANSWERED:  0x10,
    QUERY_ANSONLY:   0x20,
});

exports.sortTypes = sortTypes;

var nextId = 0;
var usersCollection;
var questionsCollection;

/* Open a connection to the database. */
exports.initialize = function(callback) {
    db.open(function(err, db) {
        if (err) {
            logger.error(err);
            process.exit(1);
        }
        logger.info('Connection to Quizzard database successful.');
    		usersCollection = db.collection('users');
    		questionsCollection = db.collection('questions');
    		getNextQuestionId(function(){ logger.info('next question: %d', nextId); });
        callback();
    });
}

// Users functions
// Add USER to usersCollection in the database
exports.addStudent = function(student, callback){ addUser(student, callback); };
exports.addAdmin = function(admin, callback){ addUser(admin, callback); };

var addUser = function(user, callback) {
    usersCollection.findOne({'id': user.id}, function(err, obj) {
        if (err) {
            logger.error(err);
            callback('failure');
        } else if (obj) {
            callback('exists');
        } else {
            usersCollection.insert(user, function(err, res) {
                callback(res);
            });
        }
    });
}

/* Return an array of users in the database. */
exports.getAdminsList = function(callback) { getUsersList('admin', callback); }
exports.getStudentsList = function(callback) { getUsersList('student', callback); }

/* Return an array of users in the database, sorted by rank. */
var getUsersList = function(type, callback){
    usersCollection.find({type : type}).sort({id: 1}).toArray(function(err, docs) {
        if (err) {
            callback([]);
        } else {
            for (s in docs)
                delete docs[s]._id;
            callback(docs);
        }
    });
}

exports.getStudentsListSorted = function(lim, callback){
    usersCollection.find({type: 'student'})
            .sort({points: -1})
            .limit(lim)
            .toArray(function(err, docs) {
        if (err) {
            callback([]);
        } else {
            for (s in docs)
                delete docs[s]._id;
            callback(docs);
        }
    });
}

/*
 * Check if the account given by user and pass is valid.
 * user type of null
 */
exports.checkLogin = function(userId, pass, callback) {
    usersCollection.findOne({'id' : userId}, function(err, obj) {
        if (err) {
            logger.error(err);
            callback(null);
        } else if (obj) {
            validatePassword(obj, pass, function(valid) {
                if (valid) {
                    delete obj._id;
                    callback(obj);
                } else {
                    logger.warn('Invalid password provided for user %s.', userId);
                    callback(null);
                }
            });
        } else {
            callback(null);
        }
    });
}

/*
 * Check the hash of pass against the password stored in userobj.
 */
var validatePassword = function(userobj, pass, callback) {
    bcrypt.compare(pass, userobj.password, function(err, res) {
        callback(res);
    });
}

// cleanup the users collection
exports.removeAllUsers = function(callback){
    usersCollection.remove({}, function(err, res) {
        if(err){
            logger.error(err);
            return callback('failure');
        }
        return callback(res);
    });
}

/*
 * Fetch the user object with ID userId in the users database.
 */
exports.getStudentById = function(studentId, callback) { getUserById(studentId, callback); }
exports.getAdminById = function(adminId, callback) { getUserById(adminId, callback); }

var getUserById = function(userId, callback){
    usersCollection.findOne({id : userId}, function(err, obj) {
        if (err) {
            logger.error(err);
            callback(null);
        } else {
            callback(obj);
        }
    });
}

// Update a student record using its Id
exports.updateStudentById = function(userId, info, callback){ updateUserById(userId, info, callback); }
exports.updateAdminById = function(userId, info, callback){ updateUserById(userId, info, callback); }

var updateUserById = function(userId, info, callback){
    var query = { id:userId };
    var update = {};

    if(typeof info.correct !== 'undefined'){
        update.$addToSet = {};
        update.$inc = {};
    }

    if(info.id)
        update.id = info.id;

    if(info.firstName)
        update.firstName = info.firstName;

    if(info.lastName)
        update.lastName = info.lastName;

    if(info.email)
        update.email = info.email;


    if(typeof info.correct !== 'undefined'){
        if(info.correct){
            update.$addToSet.answered = info.questionId;
            update.$inc.points = info.points;
            update.$inc.answeredCount = 1;
        }else{
            update.$addToSet.attempted = info.questionId;
            update.$inc.attemptedCount = 1;
        }
    }


    if(typeof info.newPassword === 'undefined'){
        usersCollection.update(query, update, function(err, res) {
            if (err) {
                logger.error(err);
                callback('failure');
            } else {
                callback('success');
            }
        });
    }else{
        bcrypt.hash(info.newPassword, 11, function(err, hash) {
    		    if (err) {
    						logger.error(err);
    		        return callback('failure');
    		    }
            update.$set = {password:hash};
            usersCollection.update(query, update, function(err, res) {
                if (err) {
                    logger.error(err);
                    callback('failure');
                } else {
                    callback('success');
                }
            });
        });
    }
}

// check if json obejct is empty
var isEmptyObject = function(obj) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

// Questions functions
// Add QUESTION to questionsCollection in the database
exports.addRegularQuestion = function(question, callback){ addQuestion(question, callback); };

var addQuestion = function(question, callback) {
	  question.id = ++nextId;
    questionsCollection.insert(question, function(err, res) {
        if(err){
            logger.error(err);
            return callback('failure');
        }
        return callback(res);
    });
}

// cleanup the users collection
exports.removeAllQuestions = function(callback){
    questionsCollection.remove({}, function(err, res) {
        if(err){
            logger.error(err);
            return callback('failure');
        }
        nextId = 0;
        logger.info('next question: %d', nextId);
        return callback(res);
    });
}

// getNextQuestionId
var getNextQuestionId = function(callback){
  	questionsCollection.find().sort({id: -1}).limit(1).toArray(function(err, docs) {
        if (err) {
            logger.error(err);
            process.exit(1);
        }
        nextId = docs[0] ? docs[0].id : 0;
        callback(nextId);
    });
}

exports.findQuestions = function(amount, findType, user, callback){
    var criteria, query;

    if (findType & sortTypes.SORT_DEFAULT) {
        criteria = {id: 1};
    } else if (findType & sortTypes.SORT_TOPIC) {
        critera = {topic : 1};
    } else if (findType & sortTypes.SORT_POINTS) {
        critera = {points : -1};
    } else {
        criteria = {};
    }

    if (findType & sortTypes.QUERY_ANSWERED) {
        if (findType & sortTypes.QUERY_ANSONLY) {
            query = {
                id: { $in: user.answered }
            };
        } else {
                query = {};
        }
    } else if (user != null) {
        query = {
            id: { $nin: user.answered }
        };
    }
    questionsCollection.find(query).sort(criteria).limit(amount).toArray(function(err, docs) {
        if (err) {
            callback('failure');
        } else {
            if (findType & sortTypes.SORT_RANDOM)
                shuffle(docs);
            for (q in docs){
                docs[q].firstAnswer = docs[q].answered[0] ? docs[q].answered[0] : 'No One';
                docs[q].attemptsCount = docs[q].attempted.length;
                docs[q].answeredCount = docs[q].answered.length;
                delete docs[q]._id;
            }
            callback(docs);
        }
    });
}

/* Classic Fisher-Yates shuffle. Nothing to see here. */
var shuffle = function(arr) {
    var curr, tmp, rnd;

    curr = arr.length;
    while (curr) {
        rnd = Math.floor(Math.random() * curr);
        --curr;

        tmp = arr[curr];
        arr[curr] = arr[rnd];
        arr[rnd] = tmp;
    }
}

/* Sort questions by the given sort type. */
exports.sortQuestions = function(qs, type, callback) {
    var cmpfn;

    if (type & sortTypes.SORT_RANDOM) {
        shuffle(qs);
        callback(qs);
        return;
    } else if (type & sortTypes.SORT_TOPIC) {
        cmpfn = function(a, b) {
            return a.topic < b.topic ? -1 : 1;
        };
    } else if (type & sortTypes.SORT_POINTS) {
        cmpfn = function(a, b) {
            return b.points - a.points;
        };
    } else {
        cmpfn = function(a, b) { return -1; };
    }

    qs.sort(cmpfn);
    callback(qs);
}

/* Extract a question object from the database using its ID. */
exports.lookupQuestion = function(qid, callback) {
    questionsCollection.findOne({id: qid}, function(err, q) {
        if (err || !q) {
            callback('failure');
        } else {
            /* necessary for later database update */
            delete q._id;
            callback(q);
        }
    });
}

// update a question record based on its id
exports.updateQuestionById = function(questionId, info, callback){
    var query = { id:questionId };
    var update = {};

    if(info.correct){
        update.$addToSet = { answered: info.userId };
    }else{
        update.$addToSet = { attempted: info.userId };
        update.$push = { attempts: info.answer };
    }

    questionsCollection.update(query, update, function(err, res) {
        if (err) {
            logger.error(err);
            callback('failure');
        } else {
            callback('success');
        }
    });
}

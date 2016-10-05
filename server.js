var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var db = require('./students.js');

var app = express();
var port = 65535;

/* print urls of all incoming requests to stdout */
app.use(function(req, res, next) {
    console.log(req.url);
    next();
});

app.set('view engine', 'pug');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'test',
    resave: true,
    saveUninitialized: false
}));

/* main page */
app.get('/', function(req, res) {
    /* if the user has already logged in, redirect to home */
    if (req.session.user != null)
        res.redirect('home');
    else
        res.render('login');
});

/* check username and password and send appropriate response */
app.post('/login', function(req, res) {
    console.log('Attempted login by user ' + req.body.user);
    db.checkLogin(req.body.user, req.body.passwd, function(obj) {
        if (obj) {
            req.session.user = obj;
            res.status(200).send('success');
        } else {
            res.status(200).send('invalid');
        }
    });
});

app.get('/home', function(req, res) {
    /* if the user has not yet logged in, redirect to login page */
    if (req.session.user == null)
        res.redirect('/')
    else
        res.render('home', { user: req.session.user });
});

app.listen(port, function() {
    console.log('server listening on http://localhost:%s', port);
});

require('dotenv').config()
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const User = require('./models/user');

const app = express();
const server = createServer(app);
const io = new Server(server);
const userOfSocket = new Map();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
});

app.use(sessionMiddleware);

mongoose.connect('mongodb://localhost:27017/mathracer')
    .then(() => {
        console.log('Mongo connection open.');
    }).catch(err => {
        console.log(err);
    });

app.get('/', (req, res) => {
    const { login, loginFailed, rememberMe, pwNoMatch, usernameTaken } = req.query;
    res.render('login', {
        login: (login != "false"),
        loginFailed: (loginFailed == "true"),
        pwNoMatch: (pwNoMatch == "true"),
        rememberMe: (rememberMe == "true"),
        usernameTaken: (usernameTaken == "true")
    });
});

io.on('connection', (socket) => {
    console.log('A user connected.');
    socket.on('username', (username) => {
        userOfSocket.set(socket, username);
        io.emit('update live users', Array.from(userOfSocket.values()));
    });
    socket.on('disconnect', () => {
        console.log('A user disconnected.');
        userOfSocket.delete(socket);
        io.emit('update live users', Array.from(userOfSocket.values()));
    });
});


app.get('/main', (req, res) => {
    const user = req.session.user;
    if (user) {
        res.render('main', { username: user.username, users: userOfSocket.values() });
    } else {
        res.redirect('/');
    }
})

function addUserToSession(req, username) {
    req.session.user = { username };
}

const verifyPassword = (req, res, next) => {
    const { username, password, rememberMe } = req.body;
    User.findOne({ username, password }).then(data => {
        if (data != null) {
            addUserToSession(req, username);
            next();
        } else {
            if (rememberMe != undefined) {
                res.redirect('/?loginFailed=true&rememberMe=true');
            } else {
                res.redirect('/?loginFailed=true');
            }
        }
    });
};

app.post('/login', verifyPassword, (_, res) => {
    res.redirect('/main');
});

app.post('/register', (req, res) => {
    const { registerUsername: username,
        registerPassword: password,
        registerRepeatPassword: repeatPassword } = req.body;
    if (password !== repeatPassword) {
        res.redirect('/?login=false&pwNoMatch=true');
    } else {
        User.findOne({ username }).then(data => {
            if (data != null) {
                res.redirect('/?login=false&usernameTaken=true');
            } else {
                User.insertOne({ username, password });
                addUserToSession(req, username);
                res.redirect('/main');
            }
        });
    }
});

server.listen(3000, () => {
    console.log('Listening on 3000');
});

app.use(express.static('public'));
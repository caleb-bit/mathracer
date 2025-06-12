require('dotenv').config()
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const User = require('./models/user');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = createServer(app);
const io = new Server(server);

// stores username associated with socket
const userOfSocketId = new Map();
const socketIdOfUser = new Map();
const socketOfUser = new Map();
const roomOfSocket = new Map();


// users waiting for a match
const usersWaiting = [];

// matches each user in a match to opponent
const usersInMatch = new Map();

// matches each room to its array of problems
const problemDataOfRoom = new Map();

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
    // res.render('temp');
    const { login, loginFailed, rememberMe, pwNoMatch, usernameTaken } = req.query;
    res.render('login', {
        login: (login != "false"),
        loginFailed: (loginFailed == "true"),
        pwNoMatch: (pwNoMatch == "true"),
        rememberMe: (rememberMe == "true"),
        usernameTaken: (usernameTaken == "true")
    });
});

io.engine.use(sessionMiddleware);

function removeFromArr(arr, value) {
    const idx = arr.indexOf(value);
    if (idx == -1) return;
    arr.splice(idx, 1);
}

class Problem {
    constructor(statement, answer) {
        this.statement = statement;
        this.answer = answer;
        this.id = uuidv4();
    }
}
class ProblemData {
    constructor(problem) {
        this.problem = problem;
        this.solvedBy = 0;
    }
}

function createProblem() {
    const rand = Math.floor(Math.random() * 4);
    if (rand == 0) {
        // addition
        const a = Math.floor(Math.random() * 1000 - 500);
        const b = Math.floor(Math.random() * 1000 - 500);
        return new Problem(`${a} + ${b}`, `${a + b}`);
    } else if (rand == 1) {
        // subtraction
        const a = Math.floor(Math.random() * 1000 - 500);
        const b = Math.floor(Math.random() * 1000 - 500);
        return new Problem(`${a} - ${b}`, `${a - b}`);
    } else if (rand == 2) {
        // multiplication
        const a = Math.floor(Math.random() * 200 - 100);
        const b = Math.floor(Math.random() * 200 - 100);
        return new Problem(`${a} × ${b}`, `${a * b}`);
    } else {
        const a = Math.floor(Math.random() * 100 - 50);
        const b = Math.floor(Math.random() * 100 - 50);
        return new Problem(`${a * b} ÷ ${b}`, `${a}`);
    }
}

function sendProblem(socket, room, problem) {
    socket.emit('newProblemMe', problem);
    socket.to(room).emit('newProblemThem', problem);
}

io.on('connection', (socket) => {
    console.log('A user connected.');
    const socketId = socket.id;
    let intervalId = null;
    let room = null;
    socket.on('username', (username) => {
        userOfSocketId.set(socketId, username);
        socketIdOfUser.set(username, socketId);
        socketOfUser.set(username, socket);
    });
    socket.on('disconnect', () => {
        const username = userOfSocketId.get(socketId);
        console.log('A user disconnected.');
        if (usersInMatch.has(username)) {
            // in match
            const opponent = usersInMatch.get(username);
            usersInMatch.delete(username);
            usersInMatch.delete(opponent);
            io.to(socketIdOfUser.get(opponent)).emit('opponentDisconnected');
        } else {
            removeFromArr(usersWaiting, username);
        }
        socketIdOfUser.delete(username);
        userOfSocketId.delete(socketId);
        socketOfUser.delete(username);
        if (intervalId != null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    });
    socket.on('joinMatch', () => {
        const user1 = userOfSocketId.get(socketId);
        if (usersWaiting.length == 0) {
            usersWaiting.push(user1);
            socket.emit('waiting');
        } else {
            const user2 = usersWaiting[0];
            const socket2 = socketOfUser.get(user2);
            usersWaiting.shift();
            usersInMatch.set(user1, user2);
            usersInMatch.set(user2, user1);
            room = `room ${usersInMatch.size / 2}`;
            socket.join(room);
            socket2.join(room);
            roomOfSocket.set(socket, room);
            roomOfSocket.set(socket2, room);
            let newProblem = createProblem();
            problemDataOfRoom.set(room, [new ProblemData(newProblem)]);
            socket.emit('inGame', { user1, user2 });
            io.to(socketIdOfUser.get(user2)).emit('inGame', { user1: user2, user2: user1 });
            let time = 3;
            io.to(room).emit('countdown', time);
            let countdown = true;
            intervalId = setInterval(() => {
                if (countdown) {
                    // during countdown
                    time--;
                    io.to(room).emit('countdown', time);
                    if (time == 0) {
                        countdown = false;
                        time = 120;
                        io.to(room).emit('newProblemMe', newProblem);
                        io.to(room).emit('newProblemThem', newProblem);
                    }
                } else {
                    // in game
                    if (time == 0) clearInterval(intervalId);
                    else {
                        io.to(room).emit('timeLeft', time);
                        time--;
                    }
                }
            }, 1000);
        }
    });
    socket.on('problemSolved', (problem) => {
        if (room == null) {
            room = roomOfSocket.get(socket);
            if (room == null) return;
        }
        let problemData = problemDataOfRoom.get(room);
        let idx = problemData.findIndex((p) => p.problem.id == problem.id);
        if (problemData[idx].solvedBy == 0) {
            problemData[idx].solvedBy++;
            if (problemData.length <= idx + 1) {
                const newProblem = createProblem();
                const newProblemData = new ProblemData(newProblem);
                problemData.push(newProblemData);
                sendProblem(socket, room, newProblem);
            } else {
                sendProblem(socket, room, problemData[idx + 1].problem);
            }
        } else {
            problemData.splice(0, idx + 1);
            if (problemData.length == 0) {
                const newProblem = createProblem();
                const newProblemData = new ProblemData(newProblem);
                problemData.push(newProblemData);
                sendProblem(socket, room, newProblem);
            } else {
                sendProblem(socket, room, problemData[0].problem);
            }
        }
    })
});

app.get('/main', (req, res) => {
    const user = req.session.user;
    if (user) {
        res.render('main', { username: user.username, rating: user.rating });
    } else {
        res.redirect('/');
    }
})

function addUserToSession(req, data) {
    req.session.user = { username: data.username, rating: data.rating };
}

const verifyPassword = (req, res, next) => {
    const { username, password, rememberMe } = req.body;
    User.findOne({ username, password }).then(data => {
        if (data != null) {
            addUserToSession(req, data);
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
                const newData = { username, password, rating: 1000 }
                User.insertOne(newData);
                addUserToSession(req, newData);
                res.redirect('/main');
            }
        });
    }
});

server.listen(3000, () => {
    console.log('Listening on 3000');
});

app.use(express.static('public'));
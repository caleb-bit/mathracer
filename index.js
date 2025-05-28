const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);
const userOfSocket = new Map();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));

mongoose.connect('mongodb://localhost:27017')
    .then(() => {
        console.log('Mongo connection open.');
    }).catch(err => {
        console.log(err);
    });

app.get('/', (req, res) => {
    res.render('login');
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
    const { username, password } = req.query;
    res.render('main', { username, password, users: userOfSocket.values() });
});

server.listen(3000, () => {
    console.log('Listening on 3000');
});

app.use(express.static('public'));
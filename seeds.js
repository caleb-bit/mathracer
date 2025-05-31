const mongoose = require('mongoose');
const User = require('./models/user');

mongoose.connect('mongodb://localhost:27017/mathracer')
    .then(() => {
        console.log('Mongo connection open.');
    }).catch(err => {
        console.log(err);
    });

const admin = new User({ username: 'admin', password: 'admin', rating: 1000 });
User.deleteMany({}).then(_ => {
    admin.save();
})
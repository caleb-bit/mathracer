const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));

mongoose.connect('mongodb://localhost:27017')
.then(() => {
    console.log('Mongo connection open.');
}).catch(err => {
    console.log(err);
})

app.get('/', (req,res) => {
    res.render('home');
})

app.listen(3000, () => {
    console.log('Listening on 3000');
})

app.use(express.static('public'));
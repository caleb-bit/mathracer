const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    rating: Number
})
module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');
const { Schema } = mongoose;

const BanSchema = new Schema({
    userID: {
        type: String,
        required: true,
        unique: true,
    },
    details: {
        type: String,
        required: true,
    },
});

module.exports = mongoose.model('Ban', BanSchema);
const mongoose = require('mongoose');
const state = require('./state');
const { Schema } = mongoose;

const ProfileSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    level: {
        level: {
            type: Number,
            required: true,
        },
        state: {
            type: Number,
            required: true,
        },
    },
    credit_rating: {
        type: Number,
        required: true,
    },
    achievements: [{
        name: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
    }]
});

module.exports = mongoose.model('Profile', ProfileSchema);
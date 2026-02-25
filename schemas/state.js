const mongoose = require('mongoose');
const { Schema } = mongoose;

const StateSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    subsidy_recieve_date: {
        type: Date,
        required: true,
    },
    currentAccount: {
        type: String,
        required: true,
    },
    checkin_date: {
        type: Date,
    },
    checkin_streak: {
        type: Number,
        default: 0,
    },
});

module.exports = mongoose.model('State', StateSchema);
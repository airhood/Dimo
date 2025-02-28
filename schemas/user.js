const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
    userID: {
        type: String,
        required: true,
        unique: true,
    },
    profile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Profile',
    },
    asset: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Asset',
    },
    state: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'State',
    },
    notification_schedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NotificationSchedule',
    },
});

module.exports = mongoose.model('User', UserSchema);
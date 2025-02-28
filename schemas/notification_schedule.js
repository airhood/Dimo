const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationScheduleSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    notifications: [{
        type: String,
        required: true,
    }],
});

module.exports = mongoose.model('NotificationSchedule', NotificationScheduleSchema);
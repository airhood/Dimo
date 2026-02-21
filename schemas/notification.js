const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema({
    userID: {
        type: String,
        required: true,
    },
    // 'stock' | 'future' | 'call_option' | 'put_option' | 'fund'
    type: {
        type: String,
        enum: ['stock', 'future', 'call_option', 'put_option', 'fund'],
        required: true,
    },
    ticker: {
        type: String,
        required: true,
    },
    strikePrice: {
        type: Number, // 콜/풋옵션 전용
    },
    targetPnL: {
        type: Number,
        required: true,
    },
    // 'above': currentPnL >= targetPnL 시 알림
    // 'below': currentPnL <= targetPnL 시 알림
    direction: {
        type: String,
        enum: ['above', 'below'],
        required: true,
    },
    nextCheckAt: {
        type: Date,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Notification', NotificationSchema);

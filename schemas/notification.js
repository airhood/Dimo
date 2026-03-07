const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema({
    userID: {
        type: String,
        required: true,
    },
    // 'position': 포지션별 | 'ticker': 종목별 | 'account': 전체 계좌
    alertScope: {
        type: String,
        enum: ['position', 'ticker', 'account'],
        required: true,
    },
    // For position/ticker scope: 'stock' | 'future' | 'option' | 'binary_option' | 'fund' | 'etf'
    type: {
        type: String,
        enum: ['stock', 'future', 'option', 'binary_option', 'fund', 'etf'],
    },
    // For position scope: 1-based index into the asset array
    positionNum: {
        type: Number,
    },
    // For ticker scope
    ticker: {
        type: String,
    },
    // For option ticker scope (optional strike price filter)
    strikePrice: {
        type: Number,
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

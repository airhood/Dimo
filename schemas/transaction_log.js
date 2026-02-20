const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionLogSchema = new Schema({
    userID: {
        type: String,
        required: true,
    },
    logMessage: {
        type: String,
        required: true,
    },
    transactionDate: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

module.exports = mongoose.model('TransactionLog', TransactionLogSchema);
const mongoose = require('mongoose');
const { Schema } = mongoose;

const AutoTradeSchema = new Schema({
    userId: {
        type: String,
        required: true,
    },
    accountKey: {
        type: String,
        required: true,
    },
    script: {
        type: String,
        required: true,
        maxlength: 4000,
    },
    isRunning: {
        type: Boolean,
        default: false,
    },
    privateMode: {
        type: Boolean,
        default: false,
    },
    logs: [{
        timestamp: {
            type: Date,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
    }],
    trades: [{
        timestamp: {
            type: Date,
            required: true,
        },
        summary: {
            type: String,
            required: true,
        },
        success: {
            type: Boolean,
            required: true,
        },
    }],
    lastRunAt: {
        type: Date,
    },
    lastError: {
        type: String,
    },
});

AutoTradeSchema.index({ userId: 1, accountKey: 1 }, { unique: true });

module.exports = mongoose.model('AutoTrade', AutoTradeSchema);

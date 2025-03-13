const mongoose = require('mongoose');
const { Schema } = mongoose;

const FundSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        required: true,
    },
    fee: {
        type: Number,
        required: true,
    },
    total_units: {
        type: Number,
        required: true,
    },
    administrators: [{
        userID: {
            type: String,
            required: true,
        },
        isTopAdmin: {
            type: Boolean,
            required: true,
        }
    }],
    asset: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Asset',
        required: true,
    },
});

module.exports = mongoose.model('Fund', FundSchema);
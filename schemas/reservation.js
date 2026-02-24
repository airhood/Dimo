const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReservationSchema = new Schema({
    userId: { type: String, required: true },
    accountKey: { type: String, required: true },
    type: {
        type: String,
        enum: [
            'stock_buy', 'stock_sell',
            'future_long', 'future_short',
            'option_call_buy', 'option_put_buy',
            'option_call_sell', 'option_put_sell',
            'etf_buy', 'etf_sell',
        ],
        required: true,
    },
    ticker: { type: String, required: true },
    quantity: { type: Number },
    leverage: { type: Number },
    strikePrice: { type: Number },
    conditionPrice: { type: Number, required: true },
    conditionType: { type: String, enum: ['above', 'below'], required: true },
    status: {
        type: String,
        enum: ['pending', 'executed', 'cancelled', 'failed'],
        default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
    executedAt: { type: Date },
    failReason: { type: String },
});

module.exports = mongoose.model('Reservation', ReservationSchema);

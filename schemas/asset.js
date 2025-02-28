const mongoose = require('mongoose');
const { Schema } = mongoose;

const AssetSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    balance: {
        type: Number,
        default: 0,
    },
    stocks: [{
        ticker: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        purchasePrice: {
            type: Number,
            required: true,
        },
        purchaseDate: {
            type: Date,
            required: true,
        },
    }],
    stockShortSales: [{
        ticker: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        sellPrice: {
            type: Number,
            required: true,
        },
        sellDate: {
            type: Date,
            required: true,
        },
        buyBackDate: {
            type: Date,
            required: true,
        },
        margin: {
            type: Number,
            required: true,
        },
        uid: {
            type: Number,
            required: true,
        }
    }],
    futures: [{
        ticker: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        leverage: {
            type: Number,
            required: true,
        },
        expirationDate: {
            type: Date,
            required: true,
        },
        purchasePrice: {
            type: Number,
            required: true,
        },
        purchaseDate: {
            type: Date,
            required: true,
        },
        margin: {
            type: Number,
            required: true,
        }
    }],
    options: [{
        ticker: {
            type: String,
            required: true,
        },
        optionType: {
            type: String,
            enum: ['call', 'put'],
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        strikePrice: {
            type: Number,
            required: true,
        },
        expirationDate: {
            type: Date,
            required: true,
        },
        purchasePrice: {
            type: Number,
            required: true,
        },
        purchaseDate: {
            type: Date,
            required: true,
        },
    }],
    binary_options: [{
        ticker: {
            type: String,
            required: true,
        },
        optionType: {
            type: String,
            enum: ['call', 'put'],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        strikePrice: {
            type: Number,
            required: true,
        },
        expirationDate: {
            type: Date,
            required: true,
        },
        purchaseDate: {
            type: Date,
            required: true,
        },
        uid: {
            type: Number,
            required: true,
        }
    }],
    fixed_deposits: [{
        amount: {
            type: Number,
            required: true,
        },
        product: {
            type: Number,
            required: true,
        },
        interestRate: {
            type: Number,
            required: true,
        },
        depositDate: {
            type: Date,
            required: true,
        },
        maturityDate: {
            type: Date,
            required: true,
        },
        uid: {
            type: Number,
            required: true,
        }
    }],
    savings_accounts: [{
        amount: {
            type: Number,
            required: true,
        },
        product: {
            type: Number,
            required: true,
        },
        interestRate: {
            type: Number,
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        uid: {
            type: Number,
            required: true,
        }
    }],
    loans: [{
        amount: {
            type: Number,
            required: true,
        },
        interestRate: {
            type: Number,
            required: false,
        },
        loanDate: {
            type: Date,
            required: true,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        days: {
            type: Number,
            required: true,
        },
        uid: {
            type: Number,
            required: true,
        }
    }],
});

module.exports = mongoose.model('Asset', AssetSchema);
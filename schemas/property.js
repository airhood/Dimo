const mongoose = require('mongoose');
const { Schema } = mongoose;

const PropertySchema = new Schema({
    propertyId: {
        type: String,
        required: true,
        unique: true,
    },
    region: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    rentalYield: {
        type: Number,
        required: true,
    },
    size: {
        type: Number,
        required: true,
    },
    listedAt: {
        type: Date,
        required: true,
    },
    listedUntil: {
        type: Date,
        required: true,
    },
});

module.exports = mongoose.model('Property', PropertySchema);

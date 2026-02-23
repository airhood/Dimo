const mongoose = require('mongoose');
const { Schema } = mongoose;

const TaxRecordSchema = new Schema({
    userID:      { type: String, required: true, unique: true },
    totalAssets: { type: Number, required: true },
    taxAmount:   { type: Number, required: true },
    paid:        { type: Boolean, default: false },
    assessedAt:  { type: Date, required: true },
    dueDate:     { type: Date, required: true },
});

module.exports = mongoose.model('TaxRecord', TaxRecordSchema);

const mongoose = require('mongoose');
const { Schema } = mongoose;

const NoticeSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
});

module.exports = mongoose.model('Notice', NoticeSchema);
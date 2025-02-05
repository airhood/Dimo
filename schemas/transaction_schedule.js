const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionScheduleSchema = new Schema({
    identification_code: {
        type: String,
        required: true,
    },
    subject: {
        type: String,
        required: true,
    },
    command: {
        type: String,
        required: true,
    },
})

module.exports = mongoose.model('TransactionSchedule', TransactionScheduleSchema);
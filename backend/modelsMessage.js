const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, default: '' },
    fileUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    fileType: { type: String, default: null },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
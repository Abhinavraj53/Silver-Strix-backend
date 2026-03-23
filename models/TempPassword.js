const mongoose = require('mongoose');

const tempPasswordSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 } // auto-expire in 7 days
});

module.exports = mongoose.model('TempPassword', tempPasswordSchema);

const mongoose = require('mongoose');

const newsletterTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    html: { type: String, required: true },
    isAuto: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('NewsletterTemplate', newsletterTemplateSchema);

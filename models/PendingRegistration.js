const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingRegistrationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    shippingAddress: {
        name: { type: String, trim: true },
        phone: { type: String, trim: true },
        address: { type: String, trim: true },
        addressLine2: { type: String, trim: true },
        landmark: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        pincode: { type: String, trim: true },
        country: { type: String, trim: true },
        email: { type: String, trim: true }
    },
    emailVerificationCode: {
        type: String,
        required: true
    },
    emailVerificationCodeExpiry: {
        type: Date,
        required: true
    },
    acceptedPolicies: {
        type: Boolean,
        required: true,
        default: false
    },
    rawPassword: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // Auto-delete after 10 minutes (600 seconds)
    }
});

// Hash password before saving
pendingRegistrationSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Auto-delete expired registrations
pendingRegistrationSchema.index({ emailVerificationCodeExpiry: 1 }, { expireAfterSeconds: 0 });

const PendingRegistration = mongoose.model('PendingRegistration', pendingRegistrationSchema);

module.exports = PendingRegistration;

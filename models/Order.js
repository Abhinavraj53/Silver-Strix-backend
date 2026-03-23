const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Allow guest checkout
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: String,
        price: Number,
        quantity: {
            type: Number,
            required: true,
            min: 1
        }
    }],
    shippingAddress: {
        name: String,
        street: String,
        city: String,
        state: String,
        zipCode: String,
        phone: String,
        email: String
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'online', 'upi'],
        default: 'cod'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    paymentGateway: {
        type: String,
        enum: ['cashfree'],
        default: null
    },
    paymentGatewayOrderId: {
        type: String,
        default: null
    },
    paymentGatewayPaymentId: {
        type: String,
        default: null
    },
    paymentSessionId: {
        type: String,
        default: null
    },
    paymentVerifiedAt: {
        type: Date,
        default: null
    },
    shippingProvider: {
        type: String,
        enum: ['shiprocket'],
        default: null
    },
    shiprocketOrderId: {
        type: String,
        default: null
    },
    shiprocketShipmentId: {
        type: Number,
        default: null
    },
    shiprocketAwbCode: {
        type: String,
        default: null
    },
    shiprocketCourierName: {
        type: String,
        default: null
    },
    shiprocketTrackingStatus: {
        type: String,
        default: null
    },
    shiprocketTrackingPayload: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    shiprocketLastSyncedAt: {
        type: Date,
        default: null
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    subtotal: {
        type: Number,
        required: true
    },
    shippingCost: {
        type: Number,
        default: 0
    },
    tax: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        required: true
    },
    couponCode: {
        type: String,
        default: null
    },
    couponDiscount: {
        type: Number,
        default: 0
    },
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

orderSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Order', orderSchema);

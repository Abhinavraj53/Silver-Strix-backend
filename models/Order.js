const mongoose = require('mongoose');
const Counter = require('./Counter');

const refundEvidenceSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true
    },
    publicId: {
        type: String,
        default: null
    },
    resourceType: {
        type: String,
        enum: ['image', 'video'],
        default: 'image'
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const refundRequestSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['none', 'requested', 'return_approved', 'rejected', 'refund_pending', 'refund_initiated', 'refund_completed', 'refund_rejected'],
        default: 'none'
    },
    requestedAt: {
        type: Date,
        default: null
    },
    eligibleUntil: {
        type: Date,
        default: null
    },
    customerMessage: {
        type: String,
        default: ''
    },
    policyAccepted: {
        type: Boolean,
        default: false
    },
    evidenceImages: {
        type: [refundEvidenceSchema],
        default: []
    },
    evidenceVideo: {
        type: refundEvidenceSchema,
        default: null
    },
    adminDecisionNote: {
        type: String,
        default: ''
    },
    adminReviewedAt: {
        type: Date,
        default: null
    },
    adminReviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    returnApprovedAt: {
        type: Date,
        default: null
    },
    returnApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    returnReceivedAt: {
        type: Date,
        default: null
    },
    returnReceivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    refundAmount: {
        type: Number,
        default: 0
    },
    refundNote: {
        type: String,
        default: ''
    },
    refundApprovedAt: {
        type: Date,
        default: null
    },
    refundApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    refundInitiatedAt: {
        type: Date,
        default: null
    },
    refundCompletedAt: {
        type: Date,
        default: null
    },
    refundRejectedAt: {
        type: Date,
        default: null
    },
    refundRejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    refundReference: {
        type: String,
        default: null
    },
    refundGatewayProvider: {
        type: String,
        enum: ['cashfree', 'manual'],
        default: null
    },
    refundGatewayRefundId: {
        type: String,
        default: null
    },
    refundGatewayCfRefundId: {
        type: String,
        default: null
    },
    refundGatewayStatus: {
        type: String,
        default: null
    },
    refundGatewayResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    order_number: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        trim: true,
        default: null
    },
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
    deliveredAt: {
        type: Date,
        default: null
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
    refundRequest: {
        type: refundRequestSchema,
        default: () => ({})
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

orderSchema.pre('validate', async function (next) {
    if (!this.isNew || this.order_number) {
        return next();
    }

    try {
        const counter = await Counter.findOneAndUpdate(
            { key: 'order_number' },
            { $inc: { value: 1 }, $setOnInsert: { key: 'order_number' } },
            { new: true, upsert: true }
        );

        this.order_number = `silverstrix${counter.value}`;
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('Order', orderSchema);

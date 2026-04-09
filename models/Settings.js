const mongoose = require('mongoose');

const policySectionSchema = new mongoose.Schema({
    heading: { type: String, required: true },
    body: { type: String, required: true }
}, { _id: false });

const policySchema = new mongoose.Schema({
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    sections: {
        type: [policySectionSchema],
        default: []
    }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
    // Store Information
    storeName: {
        type: String,
        default: 'Silver Strix'
    },
    storeEmail: {
        type: String,
        default: 'info@pujnamstore.com'
    },
    storePhone: {
        type: String,
        default: '9808308849'
    },
    storeAddress: {
        type: String,
        default: 'Floor No.: 2, Building No./Flat No.: 772, LANE 8, ADARSH COLONY, SUBHASH NAGAR, Near Lakshmi Aata Chakki'
    },
    city: {
        type: String,
        default: 'Dehradun'
    },
    state: {
        type: String,
        default: 'Uttarakhand'
    },
    pincode: {
        type: String,
        default: '248002'
    },
    logo: {
        type: String,
        default: 'https://images.pexels.com/photos/8989571/pexels-photo-8989571.jpeg'
    },
    footerLogo: {
        type: String,
        default: ''
    },
    headerLogo: {
        type: String,
        default: ''
    },
    heroLogo: {
        type: String,
        default: ''
    },
    tagline: {
        type: String,
        default: 'Fragrance for every journey'
    },
    legalBusinessName: {
        type: String,
        default: 'AGASTYA ENLITE LLP'
    },
    gstNumber: {
        type: String,
        default: '05ACKFA7595E1Z6'
    },
    
    // Store Configuration
    currency: {
        type: String,
        default: 'INR'
    },
    taxRate: {
        type: Number,
        default: 18
    },
    freeShippingThreshold: {
        type: Number,
        default: 499
    },
    shippingCost: {
        type: Number,
        default: 50
    },
    refundWindowDays: {
        type: Number,
        default: 7
    },
    lowStockThreshold: {
        type: Number,
        default: 10
    },
    enableReviews: {
        type: Boolean,
        default: true
    },
    enableNewsletter: {
        type: Boolean,
        default: true
    },
    maintenanceMode: {
        type: Boolean,
        default: false
    },
    
    // Social Media
    facebookUrl: {
        type: String,
        default: ''
    },
    instagramUrl: {
        type: String,
        default: ''
    },
    twitterUrl: {
        type: String,
        default: ''
    },

    // Welcome popup
    popup: {
        enabled: { type: Boolean, default: false },
        title: { type: String, default: '10% Off Your Next Order' },
        subtitle: { type: String, default: 'Join our mailing list for exclusive updates, discounts and new launches' },
        body: { type: String, default: 'Avail 10% off your next order' },
        ctaText: { type: String, default: 'Submit' },
        imageUrl: { type: String, default: '' }
    },

    // Announcement bar + homepage highlights
    infoBarText: {
        type: String,
        default: 'Pan-India delivery on every order · Easy free returns · Secure checkout'
    },
    infoBarBackground: {
        type: String,
        default: '#0F172A'
    },
    infoBarTextColor: {
        type: String,
        default: '#E2E8F0'
    },
    highlights: {
        type: [
            {
                title: { type: String, required: true },
                description: { type: String },
                icon: { type: String, default: 'Sparkles' }
            }
        ],
        default: [
            { title: 'Pan-India Delivery', description: 'Ships to 26k+ pincodes', icon: 'Truck' },
            { title: 'Easy Free Returns', description: 'Hassle-free 7 day window', icon: 'RefreshCw' },
            { title: 'Authentic Quality', description: 'Trusted by thousands', icon: 'ShieldCheck' }
        ]
    },
    privacyPolicy: {
        type: policySchema,
        default: {
            title: 'Privacy Policy',
            summary: 'This Privacy Policy explains how AGASTYA ENLITE LLP, operating the Silver Strix website, collects, uses, stores, and protects personal information when you browse, place orders, make payments through Cashfree, or receive shipments through Shiprocket and other logistics partners.',
            sections: [
                {
                    heading: 'Information we collect',
                    body: 'We may collect your name, phone number, email address, billing and shipping address, order details, communications, and limited device or browser information required to run the website, process transactions, detect fraud, and provide customer support.'
                },
                {
                    heading: 'How we use your information',
                    body: 'We use your information to create and manage your account, process orders, confirm payments, arrange shipping, provide order updates, respond to queries, improve website performance, comply with legal obligations, and prevent misuse or fraudulent activity.'
                },
                {
                    heading: 'Payments and payment processing',
                    body: 'Online payments on this website may be processed by Cashfree and its affiliated banking or payment network partners. Payment card, UPI, or bank credentials are processed on secure payment infrastructure and are not intentionally stored by Silver Strix except for transaction references, status information, and details reasonably required for reconciliation and customer support.'
                },
                {
                    heading: 'Shipping and fulfilment',
                    body: 'To fulfil orders, we may share relevant order and address details with Shiprocket, courier partners, warehousing partners, and service providers strictly to the extent necessary for pickup, dispatch, tracking, delivery, returns, and shipment-related support.'
                },
                {
                    heading: 'Data sharing and retention',
                    body: 'We do not sell your personal information. We may share data with payment processors, logistics providers, technology vendors, legal authorities, or professional advisors when required to operate the service, meet contractual obligations, resolve disputes, or comply with law. We retain data only for as long as necessary for business, tax, accounting, fraud prevention, and legal compliance purposes.'
                },
                {
                    heading: 'Your rights and contact',
                    body: 'You may request correction of inaccurate profile or address information by contacting us. For privacy-related questions, please email contact@silverstrix.com or write to AGASTYA ENLITE LLP, Floor No. 2, Building No. 772, Lane 8, Adarsh Colony, Subhash Nagar, Near Lakshmi Aata Chakki, Clement Town, Dehradun, Uttarakhand 248002.'
                }
            ]
        }
    },
    termsPolicy: {
        type: policySchema,
        default: {
            title: 'Terms & Conditions',
            summary: 'These Terms & Conditions govern your access to and use of the Silver Strix website operated by AGASTYA ENLITE LLP. By browsing, registering, placing an order, or using any service on this website, you agree to these terms.',
            sections: [
                {
                    heading: 'Eligibility and account use',
                    body: 'You agree to provide accurate, current, and complete information during registration and checkout. You are responsible for maintaining the confidentiality of your login credentials and for all activity conducted through your account.'
                },
                {
                    heading: 'Product information and pricing',
                    body: 'We aim to display product descriptions, images, pricing, stock, offers, and availability accurately, but errors may occasionally occur. We reserve the right to correct any error, update information, limit quantities, refuse orders, or cancel transactions where pricing, stock, or listing information is inaccurate.'
                },
                {
                    heading: 'Orders, payment, and verification',
                    body: 'Orders are confirmed only after successful internal acceptance. Online payments may be processed through Cashfree. We may hold, decline, or cancel orders where payment is incomplete, suspicious, unauthorized, duplicated, or where risk checks, stock validation, or legal requirements are not satisfied.'
                },
                {
                    heading: 'Shipping, delivery, and delays',
                    body: 'Shipping timelines are estimates and may vary based on location, courier availability, weather, operational conditions, restricted service areas, or other factors beyond our control. We may use Shiprocket and connected courier partners to manage shipment creation, AWB assignment, and tracking updates.'
                },
                {
                    heading: 'User conduct and prohibited use',
                    body: 'You agree not to misuse the website, attempt unauthorized access, interfere with services, submit false claims, reverse engineer systems, use stolen payment instruments, or violate any applicable law. We may suspend or terminate access for suspected misuse or fraud.'
                },
                {
                    heading: 'Intellectual property and limitation of liability',
                    body: 'All website content, branding, text, imagery, and design elements are owned by or licensed to AGASTYA ENLITE LLP unless otherwise stated. To the maximum extent permitted by law, our liability for any claim arising from a transaction or use of the website will be limited to the value of the affected order.'
                }
            ]
        }
    },
    refundPolicy: {
        type: policySchema,
        default: {
            title: 'Refund, Return & Cancellation Policy',
            summary: 'This Refund, Return & Cancellation Policy explains how cancellations, returns, replacements, and refunds are handled for orders placed on Silver Strix. The timelines below are designed to support transparent operations with payment, shipping, and customer support workflows.',
            sections: [
                {
                    heading: 'Order cancellation before dispatch',
                    body: 'Customers may request cancellation before the order is packed or handed over to the courier. If the order has not been dispatched, approved cancellations are usually processed within 1 to 3 business days. Refunds for prepaid orders are generally initiated to the original payment source after cancellation approval.'
                },
                {
                    heading: 'Cancellation after dispatch',
                    body: 'Orders that have already been shipped may not be cancelled immediately. In such cases, customers may refuse delivery where permitted, or contact support after delivery for return guidance if the item is eligible under this policy. Shipping, reverse logistics, payment gateway, or handling charges may be deducted where applicable and lawful.'
                },
                {
                    heading: 'Return eligibility',
                    body: 'Return or replacement requests should ordinarily be raised within 48 hours of delivery for wrong item, damaged item, or defective item concerns, along with clear unboxing images or videos and order details. Items showing signs of use, tampering, missing packaging, or damage not attributable to transit or fulfilment may be rejected.'
                },
                {
                    heading: 'Non-returnable items',
                    body: 'Items that are customized, perishable, intimate, hygiene-sensitive, used, intentionally damaged after delivery, or specifically marked as non-returnable may not be eligible for return unless required by applicable consumer law.'
                },
                {
                    heading: 'Refund timelines',
                    body: 'Once a return, cancellation, or claim is approved, refunds for prepaid orders are typically initiated within 3 to 7 business days. The final credit timeline depends on your bank, card network, UPI app, wallet provider, or payment processor. Cashfree and banking partners may take additional time beyond our initiation timeline to reflect funds.'
                },
                {
                    heading: 'Contact for support',
                    body: 'For cancellation, return, or refund support, contact AGASTYA ENLITE LLP at contact@silverstrix.com or 9808308849 with your order number, registered email, and issue details. We may request supporting images, videos, delivery labels, or courier updates to investigate and resolve the request fairly.'
                }
            ]
        }
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);

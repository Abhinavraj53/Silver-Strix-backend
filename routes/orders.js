const express = require('express');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { auth, adminAuth } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const { createAdhocOrder, assignAwb, generatePickup, trackByAwb } = require('../utils/shiprocket');

const router = express.Router();

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendGuestVerificationEmail = async (email, code) => {
    const Settings = require('../models/Settings');
    const storeSettings = await Settings.getSettings();
    const storeName = storeSettings.storeName || 'SIlver Strix';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
            <div style="background:#0a1f44; color:#fff; padding:24px;">
                <h2 style="margin:0; font-size:24px;">${storeName}</h2>
                <p style="margin:4px 0 0 0; opacity:0.9;">Verify your email to complete checkout</p>
            </div>
            <div style="padding:28px;">
                <p style="margin:0 0 12px 0; color:#111827; font-size:16px;">Here is your verification code:</p>
                <div style="background:#f3f4f6; padding:20px; text-align:center; letter-spacing:8px; font-size:32px; font-weight:700; color:#0a1f44; border-radius:10px;">
                    ${code}
                </div>
                <p style="margin:16px 0 8px 0; color:#374151;">This code expires in <strong>10 minutes</strong>.</p>
                <p style="margin:0; color:#6b7280; font-size:13px;">Use this code to verify your email and activate your account.</p>
            </div>
            <div style="padding:16px 24px; background:#f9fafb; color:#6b7280; font-size:12px; text-align:center;">
                © ${new Date().getFullYear()} ${storeName}. All rights reserved.
            </div>
        </div>
    `;

    await sendEmail({
        to: email,
        subject: `${storeName} - Verify your email to complete checkout`,
        html
    });
};

// Send order confirmation email using email service
const sendOrderConfirmationEmail = async (order, customerEmail, customerName) => {
    try {
        if (!customerEmail) {
            console.log('No email provided for order confirmation');
            return false;
        }

        const Settings = require('../models/Settings');
        const storeSettings = await Settings.getSettings();
        const storeName = storeSettings.storeName || 'SIlver Strix';
        const storeEmail = process.env.BREVO_SENDER_EMAIL || storeSettings.storeEmail || 'info@pujnamstore.com';

        // Format order items for email
        const itemsHtml = order.items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹${item.price.toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `).join('');

        const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    <div style="background: linear-gradient(135deg, #FF8C00 0%, #FF6B00 100%); padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${storeName}</h1>
                        <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px;">AAPKI AASTHA KA SAARTHI</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <h2 style="color: #FF8C00; margin-top: 0;">Order Confirmation</h2>
                        <p>Dear ${customerName || 'Valued Customer'},</p>
                        <p>Thank you for your order! We have received your order and it is being processed.</p>
                        
                        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #374151; margin-top: 0;">Order Details</h3>
                            <p style="margin: 5px 0;"><strong>Order ID:</strong> #${order._id.toString().slice(-8)}</p>
                            <p style="margin: 5px 0;"><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</p>
                            <p style="margin: 5px 0;"><strong>Order Status:</strong> <span style="color: #059669; font-weight: bold;">${order.orderStatus.toUpperCase()}</span></p>
                            <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${order.paymentMethod.toUpperCase()}</p>
                            <p style="margin: 5px 0;"><strong>Payment Status:</strong> ${order.paymentStatus.toUpperCase()}</p>
                        </div>

                        <h3 style="color: #374151; margin-top: 30px;">Order Items</h3>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <thead>
                                <tr style="background-color: #f3f4f6;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Product</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #e5e7eb;">Quantity</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>

                        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <table style="width: 100%;">
                                <tr>
                                    <td style="padding: 5px 0;"><strong>Subtotal:</strong></td>
                                    <td style="padding: 5px 0; text-align: right;"><strong>₹${order.subtotal.toFixed(2)}</strong></td>
                                </tr>
                                ${order.couponDiscount > 0 ? `
                                <tr>
                                    <td style="padding: 5px 0;">Coupon Discount (${order.couponCode}):</td>
                                    <td style="padding: 5px 0; text-align: right; color: #059669;">-₹${order.couponDiscount.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td style="padding: 5px 0;">Shipping:</td>
                                    <td style="padding: 5px 0; text-align: right;">₹${order.shippingCost.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0;">Tax:</td>
                                    <td style="padding: 5px 0; text-align: right;">₹${order.tax.toFixed(2)}</td>
                                </tr>
                                <tr style="border-top: 2px solid #e5e7eb; margin-top: 10px;">
                                    <td style="padding: 10px 0 0 0;"><strong style="font-size: 18px;">Total:</strong></td>
                                    <td style="padding: 10px 0 0 0; text-align: right;"><strong style="font-size: 18px; color: #FF8C00;">₹${order.total.toFixed(2)}</strong></td>
                                </tr>
                            </table>
                        </div>

                        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #374151; margin-top: 0;">Shipping Address</h3>
                            <p style="margin: 5px 0;">${order.shippingAddress.name}</p>
                            <p style="margin: 5px 0;">${order.shippingAddress.street}</p>
                            <p style="margin: 5px 0;">${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipCode}</p>
                            <p style="margin: 5px 0;">Phone: ${order.shippingAddress.phone}</p>
                        </div>

                        <p style="margin-top: 30px;">We will send you another email once your order has been shipped.</p>
                        <p>If you have any questions, please contact us at ${storeEmail} or ${storeSettings.storePhone || ''}.</p>
                        
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                        <p style="color: #6b7280; font-size: 12px; text-align: center;">
                            © ${new Date().getFullYear()} ${storeName} - Your Trusted Puja Store<br>
                            ${storeSettings.storeAddress || ''}
                        </p>
                    </div>
                </div>
        `;

        let sent = false;

        // Brevo first
        try {
            await sendEmail({
                to: customerEmail,
                subject: `Order Confirmation - Order #${order._id.toString().slice(-8)} - ${storeName}`,
                html: html,
                from: storeEmail,
                provider: 'brevo'
            });
            sent = true;
            console.log(`✅ Order confirmation email sent via Brevo to ${customerEmail} for order #${order._id}`);
        } catch (brevoError) {
            console.error(`❌ Brevo order email failed for ${customerEmail}:`, brevoError.message || brevoError);
            // Mailgun fallback if configured
            if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
                try {
                    console.log(`🔁 Falling back to Mailgun for order #${order._id} (${customerEmail})`);
                    await sendEmail({
                        to: customerEmail,
                        subject: `Order Confirmation - Order #${order._id.toString().slice(-8)} - ${storeName}`,
                        html: html,
                        from: storeEmail,
                        provider: 'mailgun'
                    });
                    sent = true;
                    console.log(`✅ Order confirmation email sent via Mailgun to ${customerEmail} for order #${order._id}`);
                } catch (mgError) {
                    console.error(`❌ Mailgun order email failed for ${customerEmail}:`, mgError.message || mgError);
                }
            }
        }
        
        return sent;
    } catch (error) {
        console.error('❌ Error sending order confirmation email:', error.message);
        return false;
    }
};

const cashfreeAppId = process.env.CASHFREE_APP_ID || process.env.CASHFREE_KEY_ID;
const cashfreeSecretKey = process.env.CASHFREE_SECRET_KEY || process.env.CASHFREE_KEY_SECRET;
const cashfreeEnv = (process.env.CASHFREE_ENV || process.env.CASHFREE_ENVIRONMENT || 'sandbox').toLowerCase();

const cashfreeClient = cashfreeAppId && cashfreeSecretKey
    ? new Cashfree(
        cashfreeEnv === 'production' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
        cashfreeAppId,
        cashfreeSecretKey
    )
    : null;

const getCashfreeClient = () => {
    if (!cashfreeClient) {
        throw new Error('Cashfree is not configured. Set CASHFREE_APP_ID/CASHFREE_KEY_ID and CASHFREE_SECRET_KEY/CASHFREE_KEY_SECRET in backend/.env.');
    }
    return cashfreeClient;
};

const getRequestUser = async (req) => {
    let userId = null;
    let userEmail = null;
    let userName = null;

    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (token) {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            if (user) {
                userId = user._id;
                userEmail = user.email;
                userName = user.name;
            }
        }
    } catch (err) {
        // Guest checkout fallback
    }

    return { userId, userEmail, userName };
};

const buildOrderPayload = async ({ items, userId, shippingAddress, couponCode, couponDiscount, paymentMethod, notes }) => {
    let orderItems = [];
    let subtotal = 0;
    let cartId = null;

    if (items && Array.isArray(items) && items.length > 0) {
        for (const item of items) {
            const productId = item.productId || item.product?.id || item.product?._id;
            if (!productId) {
                throw new Error('Product ID is required for all items');
            }

            const mongoose = require('mongoose');
            if (!mongoose.Types.ObjectId.isValid(productId)) {
                throw new Error(`Invalid product ID: ${productId}`);
            }

            const product = await Product.findById(productId);
            if (!product) {
                throw new Error(`Product not found: ${productId}`);
            }
            if (!product.isActive) {
                throw new Error(`Product ${product.name} is not available`);
            }
            if (product.stock < item.quantity) {
                throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
            }

            subtotal += product.price * item.quantity;
            orderItems.push({
                product: product._id,
                name: product.name,
                price: product.price,
                quantity: item.quantity
            });
        }
    } else if (userId) {
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            throw new Error('Cart is empty');
        }

        cartId = cart._id;
        orderItems = cart.items.map(item => {
            subtotal += item.product.price * item.quantity;
            return {
                product: item.product._id,
                name: item.product.name,
                price: item.product.price,
                quantity: item.quantity
            };
        });
    } else {
        throw new Error('No items provided and no cart found');
    }

    if (orderItems.length === 0) {
        throw new Error('No items to order');
    }

    const Settings = require('../models/Settings');
    const storeSettings = await Settings.getSettings();
    const freeShippingThreshold = storeSettings.freeShippingThreshold || 500;
    const appliedDiscount = couponDiscount || 0;
    const subtotalAfterDiscount = Math.max(0, subtotal - appliedDiscount);
    const shippingCost = subtotalAfterDiscount > freeShippingThreshold ? 0 : (storeSettings.shippingCost || 50);
    const taxRate = storeSettings.taxRate || 18;
    const tax = Math.round(subtotalAfterDiscount * (taxRate / 100));
    const total = subtotalAfterDiscount + shippingCost + tax;

    return {
        orderItems,
        subtotal,
        shippingCost,
        tax,
        total,
        appliedDiscount,
        cartId,
        paymentMethod,
        couponCode,
        notes,
        shippingAddress: {
            name: shippingAddress?.name || shippingAddress?.street,
            street: shippingAddress?.address || shippingAddress?.street,
            city: shippingAddress?.city,
            state: shippingAddress?.state,
            zipCode: shippingAddress?.pincode || shippingAddress?.zipCode,
            phone: shippingAddress?.phone,
            email: shippingAddress?.email
        }
    };
};

const finalizePaidOrder = async (order) => {
    for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: -item.quantity }
        });
    }

    if (order.couponCode) {
        const Coupon = require('../models/Coupon');
        await Coupon.findOneAndUpdate(
            { code: order.couponCode.toUpperCase() },
            { $inc: { used_count: 1 } }
        );
    }

    if (order.user) {
        await Cart.findOneAndDelete({ user: order.user });
    }

    if (order.shippingAddress?.email) {
        const customerName = order.shippingAddress?.name;
        try {
            await sendOrderConfirmationEmail(order, order.shippingAddress.email, customerName);
        } catch (emailError) {
            console.error('Failed to send order confirmation email:', emailError);
        }
    }

    return order;
};

const createCashfreeOrderId = (orderId) => `ss_${orderId.toString().slice(-12)}_${Date.now()}`;

const getShiprocketDefaults = () => ({
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    weight: Number(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5),
    length: Number(process.env.SHIPROCKET_DEFAULT_LENGTH || 10),
    breadth: Number(process.env.SHIPROCKET_DEFAULT_BREADTH || 10),
    height: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10),
});

const getPositiveNumber = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
};

const getOrderPackageDetails = (order, defaults) => {
    const items = Array.isArray(order.items) ? order.items : [];

    if (items.length === 0) {
        return defaults;
    }

    const packageTotals = items.reduce((acc, item) => {
        const quantity = getPositiveNumber(item?.quantity, 1);
        const packageDetails = item?.product?.packageDetails || {};

        const itemWeight = getPositiveNumber(packageDetails.weight, defaults.weight);
        const itemLength = getPositiveNumber(packageDetails.length, defaults.length);
        const itemBreadth = getPositiveNumber(packageDetails.breadth, defaults.breadth);
        const itemHeight = getPositiveNumber(packageDetails.height, defaults.height);

        return {
            weight: acc.weight + (itemWeight * quantity),
            length: Math.max(acc.length, itemLength),
            breadth: Math.max(acc.breadth, itemBreadth),
            height: acc.height + (itemHeight * quantity),
        };
    }, {
        weight: 0,
        length: 0,
        breadth: 0,
        height: 0,
    });

    return {
        weight: packageTotals.weight || defaults.weight,
        length: packageTotals.length || defaults.length,
        breadth: packageTotals.breadth || defaults.breadth,
        height: packageTotals.height || defaults.height,
    };
};

const buildShiprocketPayload = (order) => {
    const defaults = getShiprocketDefaults();
    const packageDetails = getOrderPackageDetails(order, defaults);
    const shippingAddress = order.shippingAddress || {};
    const subTotal = Math.max(Number(order.total || 0) - Number(order.shippingCost || 0), 0);

    return {
        order_id: `silver-strix-${order._id.toString().slice(-10)}`,
        order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
        pickup_location: defaults.pickupLocation,
        channel_id: '',
        comment: order.notes || '',
        billing_customer_name: shippingAddress.name || 'Customer',
        billing_last_name: '',
        billing_address: shippingAddress.street || '',
        billing_address_2: '',
        billing_city: shippingAddress.city || '',
        billing_pincode: shippingAddress.zipCode || '',
        billing_state: shippingAddress.state || '',
        billing_country: 'India',
        billing_email: shippingAddress.email || '',
        billing_phone: shippingAddress.phone || '',
        shipping_is_billing: true,
        order_items: (order.items || []).map((item, index) => ({
            name: item.name || item.product?.name || `Item ${index + 1}`,
            sku: String(item.product?._id || item.product || `item-${index + 1}`),
            units: Number(item.quantity || 1),
            selling_price: Number(item.price || 0),
            discount: 0,
            tax: '',
        })),
        payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        shipping_charges: Number(order.shippingCost || 0),
        giftwrap_charges: 0,
        transaction_charges: 0,
        total_discount: Number(order.couponDiscount || 0),
        sub_total: Number(subTotal.toFixed(2)),
        length: packageDetails.length,
        breadth: packageDetails.breadth,
        height: packageDetails.height,
        weight: Number(packageDetails.weight.toFixed(3)),
    };
};

const deriveShiprocketStatus = (trackingData) => {
    const tracking = trackingData?.tracking_data || trackingData?.data || trackingData;
    const status =
        tracking?.shipment_status ||
        tracking?.current_status ||
        tracking?.track_status ||
        tracking?.shipment_track?.[0]?.current_status ||
        tracking?.shipment_track_activities?.[0]?.activity ||
        null;

    return status ? String(status) : null;
};

const mapTrackingToOrderStatus = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('delivered')) return 'delivered';
    if (normalized.includes('out for delivery') || normalized.includes('in transit') || normalized.includes('shipped')) return 'shipped';
    if (normalized.includes('pickup') || normalized.includes('manifest') || normalized.includes('awb')) return 'processing';
    return null;
};

// Get user orders
router.get('/', auth, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .populate('items.product', 'name images price')
            .sort('-createdAt');
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/payment-session', async (req, res) => {
    try {
        const { shippingAddress, paymentMethod, notes, items, couponCode, couponDiscount } = req.body;
        const { userId, userEmail, userName } = await getRequestUser(req);

        if (!userId) {
            return res.status(401).json({ error: 'Please verify your email via OTP before starting payment.' });
        }

        if (!['upi', 'online'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'Cashfree is only available for online payments.' });
        }

        const orderPayload = await buildOrderPayload({
            items,
            userId,
            shippingAddress,
            couponCode,
            couponDiscount,
            paymentMethod,
            notes
        });

        const customerEmail = userEmail || orderPayload.shippingAddress.email;
        if (!customerEmail) {
            return res.status(400).json({ error: 'Customer email is required to start payment.' });
        }

        const order = new Order({
            user: userId,
            items: orderPayload.orderItems,
            shippingAddress: {
                ...orderPayload.shippingAddress,
                email: customerEmail
            },
            paymentMethod,
            subtotal: orderPayload.subtotal,
            shippingCost: orderPayload.shippingCost,
            tax: orderPayload.tax,
            total: orderPayload.total,
            couponCode: couponCode || null,
            couponDiscount: orderPayload.appliedDiscount,
            notes,
            orderStatus: 'pending',
            paymentStatus: 'pending',
            paymentGateway: 'cashfree'
        });

        await order.save();

        const cashfreeOrderId = createCashfreeOrderId(order._id);
        const customerPhone = (orderPayload.shippingAddress.phone || '').replace(/\D/g, '').slice(-10);
        const client = getCashfreeClient();
        const response = await client.PGCreateOrder({
            order_amount: Number(order.total.toFixed(2)),
            order_currency: 'INR',
            order_id: cashfreeOrderId,
            customer_details: {
                customer_id: userId.toString(),
                customer_name: userName || orderPayload.shippingAddress.name || 'Silver Strix Customer',
                customer_email: customerEmail,
                customer_phone: customerPhone || '9999999999'
            },
            order_meta: {
                payment_methods: paymentMethod === 'upi' ? 'upi' : 'cc,dc,upi'
            },
            order_note: notes || `Silver Strix order ${order._id.toString().slice(-8)}`
        });

        order.paymentGatewayOrderId = response.data.order_id;
        order.paymentSessionId = response.data.payment_session_id;
        await order.save();

        res.status(201).json({
            message: 'Payment session created successfully',
            order,
            paymentSessionId: response.data.payment_session_id,
            paymentGatewayOrderId: response.data.order_id
        });
    } catch (error) {
        console.error('Payment session creation error:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment session' });
    }
});

router.get('/:id/payment-status', auth, async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!order.paymentGatewayOrderId) {
            return res.status(400).json({ error: 'This order does not have an online payment session.' });
        }

        const client = getCashfreeClient();
        const [orderResponse, paymentsResponse] = await Promise.all([
            client.PGFetchOrder(order.paymentGatewayOrderId),
            client.PGOrderFetchPayments(order.paymentGatewayOrderId)
        ]);

        const successfulPayment = (paymentsResponse.data || []).find((payment) => payment.payment_status === 'SUCCESS');
        const failedPayment = (paymentsResponse.data || []).find((payment) => payment.payment_status === 'FAILED');

        if (successfulPayment) {
            const wasAlreadyPaid = order.paymentStatus === 'paid';
            order.paymentStatus = 'paid';
            order.orderStatus = order.orderStatus === 'cancelled' ? order.orderStatus : 'confirmed';
            order.paymentGatewayPaymentId = String(successfulPayment.cf_payment_id);
            order.paymentVerifiedAt = new Date();
            await order.save();

            if (!wasAlreadyPaid) {
                await finalizePaidOrder(order);
            }

            return res.json({
                status: 'paid',
                gatewayOrderStatus: orderResponse.data?.order_status || 'PAID',
                order
            });
        }

        if (failedPayment && ['FAILED', 'EXPIRED', 'TERMINATED'].includes(orderResponse.data?.order_status || '')) {
            order.paymentStatus = 'failed';
            await order.save();
            return res.json({
                status: 'failed',
                gatewayOrderStatus: orderResponse.data?.order_status || 'FAILED',
                order
            });
        }

        res.json({
            status: 'pending',
            gatewayOrderStatus: orderResponse.data?.order_status || 'ACTIVE',
            order
        });
    } catch (error) {
        console.error('Payment status fetch error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch payment status' });
    }
});

// Get single order
router.get('/:id', auth, async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
            .populate('items.product', 'name images price');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create order from cart or items
router.post('/', async (req, res) => {
    try {
        const { shippingAddress, paymentMethod, notes, items, couponCode, couponDiscount } = req.body;

        const { userId, userEmail, userName } = await getRequestUser(req);
        const orderPayload = await buildOrderPayload({
            items,
            userId,
            shippingAddress,
            couponCode,
            couponDiscount,
            paymentMethod,
            notes
        });

        const customerEmail = userEmail || orderPayload.shippingAddress.email;
        if (!customerEmail) {
            return res.status(400).json({ error: 'Customer email is required to place an order.' });
        }
        const customerName = orderPayload.shippingAddress.name || userName;

        // Enforce verified session: orders require logged-in/verified user
        if (!userId) {
            return res.status(401).json({ error: 'Please verify your email via OTP before placing the order.' });
        }

        // Create order (user can be null for guest checkout)
        const order = new Order({
            user: userId,
            items: orderPayload.orderItems,
            shippingAddress: { ...orderPayload.shippingAddress, email: customerEmail },
            paymentMethod: paymentMethod || 'cod',
            subtotal: orderPayload.subtotal,
            shippingCost: orderPayload.shippingCost,
            tax: orderPayload.tax,
            total: orderPayload.total,
            couponCode: couponCode || null,
            couponDiscount: orderPayload.appliedDiscount,
            notes,
            orderStatus: 'confirmed',
            paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending'
        });

        await order.save();

        await finalizePaidOrder({
            ...order.toObject(),
            items: order.items,
            shippingAddress: order.shippingAddress,
            user: order.user,
            couponCode: order.couponCode
        });

        res.status(201).json({ message: 'Order placed successfully', order });
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cancel order
router.put('/:id/cancel', auth, async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!['pending', 'confirmed'].includes(order.orderStatus)) {
            return res.status(400).json({ error: 'Cannot cancel this order' });
        }

        order.orderStatus = 'cancelled';
        await order.save();

        // Restore product stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { stock: item.quantity }
            });
        }

        res.json({ message: 'Order cancelled', order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Get all orders
router.get('/admin/all', adminAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const query = {};
        if (status) query.orderStatus = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const orders = await Order.find(query)
            .populate('user', 'name email')
            .populate('items.product', 'name images')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Order.countDocuments(query);

        res.json({
            orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/admin/:id/shiprocket/create', adminAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items.product', 'name slug packageDetails');
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.orderStatus === 'cancelled') {
            return res.status(400).json({ error: 'Cancelled orders cannot be shipped via Shiprocket.' });
        }

        if (!order.shippingAddress?.street || !order.shippingAddress?.city || !order.shippingAddress?.state || !order.shippingAddress?.zipCode || !order.shippingAddress?.phone || !order.shippingAddress?.email) {
            return res.status(400).json({ error: 'Order is missing required shipping address details for Shiprocket.' });
        }

        if (order.shiprocketShipmentId) {
            return res.json({ message: 'Shiprocket shipment already exists for this order.', order });
        }

        const createResponse = await createAdhocOrder(buildShiprocketPayload(order));

        order.shippingProvider = 'shiprocket';
        order.shiprocketOrderId = String(
            createResponse?.order_id ||
            createResponse?.order_details?.order_id ||
            createResponse?.data?.order_id ||
            ''
        ) || null;
        order.shiprocketShipmentId = Number(
            createResponse?.shipment_id ||
            createResponse?.shipment_details?.shipment_id ||
            createResponse?.data?.shipment_id ||
            0
        ) || null;
        order.orderStatus = ['pending', 'confirmed'].includes(order.orderStatus) ? 'processing' : order.orderStatus;

        if (order.shiprocketShipmentId) {
            try {
                const awbResponse = await assignAwb({ shipmentId: order.shiprocketShipmentId });
                order.shiprocketAwbCode = String(
                    awbResponse?.response?.data?.awb_code ||
                    awbResponse?.awb_code ||
                    awbResponse?.data?.awb_code ||
                    ''
                ) || order.shiprocketAwbCode;
                order.shiprocketCourierName =
                    awbResponse?.response?.data?.courier_name ||
                    awbResponse?.courier_name ||
                    awbResponse?.data?.courier_name ||
                    order.shiprocketCourierName;
            } catch (awbError) {
                console.warn('Shiprocket AWB assignment failed:', awbError.message);
            }

            try {
                await generatePickup({ shipmentId: order.shiprocketShipmentId });
            } catch (pickupError) {
                console.warn('Shiprocket pickup generation failed:', pickupError.message);
            }
        }

        await order.save();
        res.json({ message: 'Shiprocket shipment created successfully.', order });
    } catch (error) {
        console.error('Shiprocket shipment creation error:', error);
        res.status(500).json({ error: error.message || 'Failed to create Shiprocket shipment' });
    }
});

router.get('/admin/:id/shiprocket/track', adminAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!order.shiprocketAwbCode) {
            return res.status(400).json({ error: 'No Shiprocket AWB found for this order yet.' });
        }

        const trackingData = await trackByAwb(order.shiprocketAwbCode);
        const trackingStatus = deriveShiprocketStatus(trackingData);
        const mappedOrderStatus = mapTrackingToOrderStatus(trackingStatus);

        order.shippingProvider = 'shiprocket';
        order.shiprocketTrackingPayload = trackingData;
        order.shiprocketTrackingStatus = trackingStatus;
        order.shiprocketLastSyncedAt = new Date();

        if (mappedOrderStatus && order.orderStatus !== 'cancelled') {
            order.orderStatus = mappedOrderStatus;
        }

        await order.save();
        res.json({ order, tracking: trackingData });
    } catch (error) {
        console.error('Shiprocket tracking error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch Shiprocket tracking' });
    }
});

// Admin: Update order status
router.put('/admin/:id/status', adminAuth, async (req, res) => {
    try {
        const { orderStatus, paymentStatus } = req.body;

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { orderStatus, paymentStatus },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ message: 'Order status updated', order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

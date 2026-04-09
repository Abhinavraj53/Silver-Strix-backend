const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const puppeteer = require('puppeteer');
const { Readable } = require('stream');
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
const SHIPROCKET_MAINTENANCE_MESSAGE = 'Shiprocket is under maintenance right now. Please process shipments manually for the time being.';
const isShiprocketDisabled = () => process.env.SHIPROCKET_DISABLED === 'true';
const CASHFREE_API_VERSION = '2022-09-01';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const refundUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed for refund evidence.'), false);
        }
    },
});

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

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const getInvoiceFileName = (order, extension = 'pdf') =>
    `${order?.order_number || `order-${order?._id?.toString()?.slice(-8) || 'invoice'}`}-invoice.${extension}`;

const buildInvoiceHtml = async (order, options = {}) => {
    const Settings = require('../models/Settings');
    const storeSettings = await Settings.getSettings();
    const storeName = storeSettings.storeName || 'Silver Strix';
    const logoUrl = storeSettings.headerLogo || storeSettings.logo || '';
    const legalBusinessName = storeSettings.legalBusinessName || storeName;
    const orderLabel = order?.order_number || order?._id?.toString()?.slice(-8) || 'N/A';
    const invoiceNumber = `INV-${String(orderLabel).toUpperCase()}`;
    const issueDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const shippingAddress = order?.shippingAddress || {};
    const itemsHtml = (order?.items || []).map((item, index) => {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const lineTotal = quantity * price;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="item-name">${escapeHtml(item.name || item.product?.name || 'Product')}</div>
                </td>
                <td>${quantity}</td>
                <td>${formatCurrency(price)}</td>
                <td>${formatCurrency(lineTotal)}</td>
            </tr>
        `;
    }).join('');

    const sellerAddress = [
        storeSettings.storeAddress,
        [storeSettings.city, storeSettings.state, storeSettings.pincode].filter(Boolean).join(', '),
    ].filter(Boolean).join('<br>');

    const customerAddress = [
        escapeHtml(shippingAddress.name || 'Customer'),
        escapeHtml(shippingAddress.street || ''),
        escapeHtml([shippingAddress.city, shippingAddress.state, shippingAddress.zipCode].filter(Boolean).join(', ')),
        shippingAddress.phone ? `Phone: ${escapeHtml(shippingAddress.phone)}` : '',
        shippingAddress.email ? `Email: ${escapeHtml(shippingAddress.email)}` : '',
    ].filter(Boolean).join('<br>');

    const showActions = options.showActions !== false;
    const styles = `
                :root {
                    --primary: #4A2C2A;
                    --accent: #C2A878;
                    --surface: #F8F4EE;
                    --text: #1F2937;
                    --muted: #6B7280;
                    --border: #E5E7EB;
                }
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    color: var(--text);
                    background: linear-gradient(180deg, #f5efe7 0%, #ffffff 100%);
                    padding: 24px;
                }
                .invoice {
                    max-width: 920px;
                    margin: 0 auto;
                    background: #ffffff;
                    border: 1px solid rgba(74, 44, 42, 0.12);
                    border-radius: 24px;
                    overflow: hidden;
                    box-shadow: 0 20px 60px rgba(31, 41, 55, 0.08);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    gap: 24px;
                    padding: 32px;
                    background:
                        radial-gradient(circle at top left, rgba(194, 168, 120, 0.22), transparent 38%),
                        linear-gradient(135deg, rgba(74, 44, 42, 0.98), rgba(58, 31, 29, 0.96));
                    color: #ffffff;
                }
                .brand {
                    display: flex;
                    gap: 18px;
                    align-items: center;
                }
                .brand-logo {
                    width: 78px;
                    height: 78px;
                    border-radius: 20px;
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.18);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .brand-logo img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }
                .brand-copy h1 {
                    margin: 0;
                    font-size: 32px;
                    letter-spacing: 0.04em;
                }
                .brand-copy p {
                    margin: 8px 0 0 0;
                    max-width: 440px;
                    color: rgba(255,255,255,0.78);
                    line-height: 1.6;
                }
                .invoice-meta {
                    min-width: 240px;
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.14);
                    border-radius: 18px;
                    padding: 20px;
                    align-self: flex-start;
                }
                .invoice-meta h2 {
                    margin: 0 0 16px 0;
                    font-size: 24px;
                    letter-spacing: 0.08em;
                }
                .meta-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    font-size: 14px;
                    padding: 6px 0;
                }
                .meta-label {
                    color: rgba(255,255,255,0.72);
                }
                .content {
                    padding: 32px;
                }
                .top-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 20px;
                }
                .card {
                    border: 1px solid var(--border);
                    border-radius: 20px;
                    background: #ffffff;
                    padding: 22px;
                }
                .card.surface {
                    background: var(--surface);
                    border-color: rgba(74, 44, 42, 0.1);
                }
                .eyebrow {
                    margin: 0 0 10px 0;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.24em;
                    text-transform: uppercase;
                    color: rgba(74, 44, 42, 0.7);
                }
                .card p {
                    margin: 0;
                    color: var(--muted);
                    line-height: 1.7;
                    font-size: 14px;
                }
                .table-wrap {
                    margin-top: 24px;
                    border: 1px solid var(--border);
                    border-radius: 20px;
                    overflow: hidden;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                thead {
                    background: var(--surface);
                }
                th, td {
                    padding: 16px 18px;
                    border-bottom: 1px solid var(--border);
                    text-align: left;
                    font-size: 14px;
                }
                th {
                    font-size: 12px;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: rgba(74, 44, 42, 0.7);
                }
                tbody tr:last-child td {
                    border-bottom: 0;
                }
                .item-name {
                    font-weight: 700;
                    color: var(--text);
                }
                .summary {
                    margin-top: 24px;
                    display: grid;
                    grid-template-columns: 1.2fr 0.8fr;
                    gap: 24px;
                }
                .note-box {
                    border: 1px solid rgba(74, 44, 42, 0.1);
                    background: var(--surface);
                    border-radius: 20px;
                    padding: 22px;
                    font-size: 14px;
                    color: var(--muted);
                    line-height: 1.7;
                }
                .totals {
                    border: 1px solid rgba(74, 44, 42, 0.1);
                    border-radius: 20px;
                    padding: 22px;
                    background: #ffffff;
                }
                .totals-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 8px 0;
                    color: var(--muted);
                }
                .totals-row strong {
                    color: var(--text);
                }
                .totals-row.total {
                    border-top: 1px solid var(--border);
                    margin-top: 10px;
                    padding-top: 16px;
                    font-size: 18px;
                    color: var(--primary);
                }
                .actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 0 32px 24px 32px;
                }
                .action-btn {
                    border: 1px solid rgba(74, 44, 42, 0.14);
                    border-radius: 999px;
                    padding: 12px 18px;
                    background: white;
                    color: var(--primary);
                    font-weight: 700;
                    cursor: pointer;
                }
                .action-btn.primary {
                    background: var(--primary);
                    color: white;
                }
                .footer {
                    border-top: 1px solid var(--border);
                    padding: 20px 32px 28px 32px;
                    font-size: 12px;
                    color: var(--muted);
                    text-align: center;
                    line-height: 1.7;
                }
                @media print {
                    body {
                        background: #ffffff;
                        padding: 0;
                    }
                    .invoice {
                        box-shadow: none;
                        border-radius: 0;
                        border: 0;
                    }
                    .actions {
                        display: none !important;
                    }
                }
                @media (max-width: 768px) {
                    body { padding: 12px; }
                    .header, .content { padding: 20px; }
                    .header, .summary, .top-grid {
                        grid-template-columns: 1fr;
                        display: grid;
                    }
                    .brand {
                        align-items: flex-start;
                    }
                    .invoice-meta {
                        min-width: 0;
                    }
                    th, td {
                        padding: 12px;
                        font-size: 13px;
                    }
                    .actions {
                        justify-content: stretch;
                        padding: 0 20px 20px 20px;
                        flex-direction: column;
                    }
                }
    `;

    const markup = `
            <div class="invoice">
                <div class="header">
                    <div class="brand">
                        <div class="brand-logo">
                            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(storeName)} logo" />` : `<span style="font-size:30px; font-weight:700; letter-spacing:0.08em;">SS</span>`}
                        </div>
                        <div class="brand-copy">
                            <h1>${escapeHtml(storeName)}</h1>
                            <p>Professional order invoice for your Silver Strix purchase. Thank you for shopping with us.</p>
                        </div>
                    </div>
                    <div class="invoice-meta">
                        <h2>Invoice</h2>
                        <div class="meta-row"><span class="meta-label">Invoice No.</span><strong>${escapeHtml(invoiceNumber)}</strong></div>
                        <div class="meta-row"><span class="meta-label">Order ID</span><strong>${escapeHtml(orderLabel)}</strong></div>
                        <div class="meta-row"><span class="meta-label">Issued On</span><strong>${escapeHtml(issueDate)}</strong></div>
                        <div class="meta-row"><span class="meta-label">Status</span><strong>${escapeHtml(String(order.orderStatus || 'pending').toUpperCase())}</strong></div>
                        <div class="meta-row"><span class="meta-label">Payment</span><strong>${escapeHtml(String(order.paymentStatus || 'pending').toUpperCase())}</strong></div>
                    </div>
                </div>

                <div class="content">
                    <div class="top-grid">
                        <div class="card">
                            <p class="eyebrow">Seller</p>
                            <p>
                                <strong style="color:#111827;">${escapeHtml(legalBusinessName)}</strong><br>
                                ${sellerAddress || escapeHtml(storeName)}<br>
                                ${storeSettings.gstNumber ? `GSTIN: ${escapeHtml(storeSettings.gstNumber)}<br>` : ''}
                                ${storeSettings.storePhone ? `Phone: ${escapeHtml(storeSettings.storePhone)}<br>` : ''}
                                ${storeSettings.storeEmail ? `Email: ${escapeHtml(storeSettings.storeEmail)}` : ''}
                            </p>
                        </div>
                        <div class="card surface">
                            <p class="eyebrow">Bill To / Ship To</p>
                            <p>${customerAddress || 'Customer address not available'}</p>
                        </div>
                    </div>

                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style="width:70px;">#</th>
                                    <th>Product</th>
                                    <th style="width:110px;">Qty</th>
                                    <th style="width:160px;">Unit Price</th>
                                    <th style="width:160px;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <div class="summary">
                        <div class="note-box">
                            <p class="eyebrow">Notes</p>
                            <div>
                                ${order?.notes ? escapeHtml(order.notes) : 'This is a system-generated invoice for your order. Please keep it for your records.'}
                            </div>
                            <div style="margin-top:14px;">
                                For support, contact ${escapeHtml(storeSettings.storeEmail || 'support')} or ${escapeHtml(storeSettings.storePhone || 'our support team')}.
                            </div>
                        </div>
                        <div class="totals">
                            <div class="totals-row"><span>Subtotal</span><strong>${formatCurrency(order.subtotal)}</strong></div>
                            <div class="totals-row"><span>Discount</span><strong>- ${formatCurrency(order.couponDiscount || 0)}</strong></div>
                            <div class="totals-row"><span>Shipping</span><strong>${formatCurrency(order.shippingCost)}</strong></div>
                            <div class="totals-row"><span>Tax</span><strong>${formatCurrency(order.tax)}</strong></div>
                            <div class="totals-row total"><span>Total</span><strong>${formatCurrency(order.total)}</strong></div>
                        </div>
                    </div>
                </div>

                ${showActions ? `
                    <div class="actions">
                        <button class="action-btn" onclick="window.close()">Close</button>
                        <button class="action-btn primary" onclick="window.print()">Print / Save PDF</button>
                    </div>
                ` : ''}

                <div class="footer">
                    This invoice is generated electronically by ${escapeHtml(storeName)} and does not require a physical signature.<br>
                    ${escapeHtml(legalBusinessName)}${storeSettings.gstNumber ? ` · GSTIN ${escapeHtml(storeSettings.gstNumber)}` : ''}
                </div>
            </div>
    `;

    if (options.fullDocument === false) {
        return `
            <style>${styles}</style>
            ${markup}
        `;
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(storeName)} Invoice ${escapeHtml(orderLabel)}</title>
            <style>${styles}</style>
        </head>
        <body>
            ${markup}
        </body>
        </html>
    `;
};

const generateInvoicePdfBuffer = async (order) => {
    const html = await buildInvoiceHtml(order, { showActions: false, fullDocument: true });
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('screen');

        const pdfBytes = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '12mm',
                right: '10mm',
                bottom: '12mm',
                left: '10mm',
            },
        });

        return Buffer.from(pdfBytes);
    } finally {
        await browser.close();
    }
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
        const storeName = storeSettings.storeName || 'Silver Strix';
        const storeEmail = process.env.BREVO_SENDER_EMAIL || storeSettings.storeEmail || 'hello@silverstrix.com';
        const invoiceHtml = await buildInvoiceHtml(order, { showActions: false, fullDocument: false });
        const invoicePdf = await generateInvoicePdfBuffer(order);
        const html = `
            <div style="font-family: Arial, sans-serif; background:#f8f4ee; padding:24px;">
                <div style="max-width: 920px; margin: 0 auto;">
                    <div style="background:#ffffff; border-radius:20px; padding:24px; margin-bottom:18px; border:1px solid rgba(74,44,42,0.12);">
                        <p style="margin:0 0 10px 0; color:#4A2C2A; font-size:12px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase;">Order Confirmed</p>
                        <h2 style="margin:0 0 12px 0; color:#111827;">Hello ${escapeHtml(customerName || 'Customer')}, your Silver Strix invoice is ready.</h2>
                        <p style="margin:0; color:#4b5563; line-height:1.7;">
                            Thank you for your order. We have confirmed your purchase and generated the invoice below. Please keep this email for your records. For any support, contact ${escapeHtml(storeEmail)}${storeSettings.storePhone ? ` or ${escapeHtml(storeSettings.storePhone)}` : ''}.
                        </p>
                    </div>
                    ${invoiceHtml}
                </div>
            </div>
        `;

        let sent = false;

        // Brevo first
        try {
            await sendEmail({
                to: customerEmail,
                subject: `Invoice for Order ${order.order_number || order._id.toString().slice(-8)} - ${storeName}`,
                html: html,
                from: storeEmail,
                provider: 'brevo',
                attachments: [
                    {
                        filename: getInvoiceFileName(order, 'pdf'),
                        content: invoicePdf,
                        contentType: 'application/pdf',
                    },
                ],
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
                        subject: `Invoice for Order ${order.order_number || order._id.toString().slice(-8)} - ${storeName}`,
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

const getOrderStatusEmailMeta = (status) => {
    const normalized = String(status || '').toLowerCase();
    const map = {
        pending: {
            label: 'Pending',
            title: 'Your order is pending',
            description: 'We have received your order and it is currently pending review.',
        },
        confirmed: {
            label: 'Confirmed',
            title: 'Your order is confirmed',
            description: 'Your order has been confirmed and our team is preparing it for processing.',
        },
        processing: {
            label: 'Processing',
            title: 'Your order is being processed',
            description: 'Your order is now being processed and will be packed for dispatch soon.',
        },
        shipped: {
            label: 'Shipped',
            title: 'Your order has been shipped',
            description: 'Your order is on the way. You can expect delivery updates soon.',
        },
        delivered: {
            label: 'Delivered',
            title: 'Your order has been delivered',
            description: 'Your order has been marked as delivered. We hope you enjoy your purchase.',
        },
        cancelled: {
            label: 'Cancelled',
            title: 'Your order has been cancelled',
            description: 'Your order has been cancelled. If this was unexpected, please contact support.',
        },
    };

    return map[normalized] || {
        label: normalized || 'Updated',
        title: 'Your order status has been updated',
        description: 'There is a new update on your order status.',
    };
};

const sendOrderStatusUpdateEmail = async (order) => {
    try {
        const customerEmail = order?.shippingAddress?.email;
        if (!customerEmail) {
            return false;
        }

        const Settings = require('../models/Settings');
        const storeSettings = await Settings.getSettings();
        const storeName = storeSettings.storeName || 'Silver Strix';
        const storeEmail = process.env.BREVO_SENDER_EMAIL || storeSettings.storeEmail || 'hello@silverstrix.com';
        const customerName = order?.shippingAddress?.name || 'Customer';
        const statusMeta = getOrderStatusEmailMeta(order?.orderStatus);
        const orderLabel = order?.order_number || order?._id?.toString()?.slice(-8) || 'N/A';
        const trackingLine = order?.shiprocketAwbCode
            ? `<p style="margin: 6px 0;"><strong>Tracking / AWB:</strong> ${order.shiprocketAwbCode}</p>`
            : '';

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
                <div style="background:#4A2C2A; color:#ffffff; padding:24px 28px;">
                    <h1 style="margin:0; font-size:28px;">${storeName}</h1>
                    <p style="margin:8px 0 0 0; font-size:14px; opacity:0.9;">Order status update</p>
                </div>
                <div style="padding:28px;">
                    <p style="margin:0 0 12px 0; color:#111827; font-size:16px;">Dear ${customerName},</p>
                    <p style="margin:0 0 18px 0; color:#374151; line-height:1.6;">
                        ${statusMeta.description}
                    </p>
                    <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:18px 20px; margin-bottom:20px;">
                        <p style="margin:0 0 8px 0; color:#111827;"><strong>Order ID:</strong> ${orderLabel}</p>
                        <p style="margin:0 0 8px 0; color:#111827;"><strong>New Status:</strong> ${statusMeta.label}</p>
                        <p style="margin:0 0 8px 0; color:#111827;"><strong>Payment Status:</strong> ${String(order?.paymentStatus || 'pending').toUpperCase()}</p>
                        ${trackingLine}
                    </div>
                    <p style="margin:0; color:#4b5563; line-height:1.6;">
                        If you have any questions, please reply to ${storeEmail} or contact our support team.
                    </p>
                </div>
                <div style="padding:16px 28px; background:#f9fafb; color:#6b7280; font-size:12px; text-align:center;">
                    © ${new Date().getFullYear()} ${storeName}. All rights reserved.
                </div>
            </div>
        `;

        await sendEmail({
            to: customerEmail,
            subject: `${storeName} - ${statusMeta.title} (${orderLabel})`,
            html,
            from: storeEmail,
        });

        return true;
    } catch (error) {
        console.error('Order status update email error:', error.message || error);
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

const getFrontendBaseUrl = (req) => {
    const configuredFrontendUrl = String(process.env.FRONTEND_URL || '').trim();
    if (configuredFrontendUrl) {
        return configuredFrontendUrl.replace(/\/+$/, '');
    }

    const requestOrigin = String(req.headers.origin || '').trim();
    if (requestOrigin) {
        return requestOrigin.replace(/\/+$/, '');
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').trim();
    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
    }

    return 'http://localhost:5174';
};

const uploadBufferToCloudinary = async (file, folder, resourceType = 'auto') => {
    if (!file) return null;

    const stream = Readable.from(file.buffer);
    const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
            },
            (err, uploadResult) => (err ? reject(err) : resolve(uploadResult))
        );
        stream.pipe(uploadStream);
    });

    return {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: resourceType === 'video' ? 'video' : 'image',
        uploadedAt: new Date(),
    };
};

const getRefundWindowDays = async () => {
    const Settings = require('../models/Settings');
    const settings = await Settings.getSettings();
    const raw = Number(settings?.refundWindowDays);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 7;
};

const getRefundReferenceDate = (order) => {
    return order?.deliveredAt || order?.updatedAt || order?.createdAt || new Date();
};

const getRefundEligibility = async (order) => {
    const refundWindowDays = await getRefundWindowDays();
    const referenceDate = getRefundReferenceDate(order);
    const eligibleUntil = new Date(referenceDate);
    eligibleUntil.setDate(eligibleUntil.getDate() + refundWindowDays);

    if (order.orderStatus !== 'delivered') {
        return {
            eligible: false,
            reason: 'order-not-delivered',
            refundWindowDays,
            eligibleUntil,
        };
    }

    if (Date.now() > eligibleUntil.getTime()) {
        return {
            eligible: false,
            reason: 'refund-window-expired',
            refundWindowDays,
            eligibleUntil,
        };
    }

    return {
        eligible: true,
        reason: null,
        refundWindowDays,
        eligibleUntil,
    };
};

const getRefundStateLabel = (status) => {
    const map = {
        none: 'Not requested',
        requested: 'Awaiting admin review',
        return_approved: 'Return approved',
        rejected: 'Request rejected',
        refund_pending: 'Return received, refund pending',
        refund_initiated: 'Refund initiated',
        refund_completed: 'Refund completed',
        refund_rejected: 'Refund rejected',
    };

    return map[status] || status || 'Unknown';
};

const applyRefundGatewayStatus = (order, refundResponse) => {
    const gatewayStatus = String(
        refundResponse?.refund_status ||
        refundResponse?.data?.refund_status ||
        ''
    ).toUpperCase();

    order.refundRequest.refundGatewayStatus = gatewayStatus || order.refundRequest.refundGatewayStatus;
    order.refundRequest.refundGatewayResponse = refundResponse;

    if (['SUCCESS', 'COMPLETED', 'PROCESSED'].includes(gatewayStatus)) {
        order.refundRequest.status = 'refund_completed';
        order.refundRequest.refundCompletedAt = new Date();
    } else if (['FAILED', 'CANCELLED', 'REJECTED'].includes(gatewayStatus)) {
        order.refundRequest.status = 'refund_rejected';
        order.refundRequest.refundRejectedAt = new Date();
    } else {
        order.refundRequest.status = 'refund_initiated';
    }

    return order;
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

    if (!isShiprocketDisabled()) {
        try {
            await attemptAutoShiprocketSync(order._id || order.id, 'finalize-paid-order');
        } catch (shiprocketError) {
            console.error('Auto Shiprocket sync failed:', shiprocketError.message || shiprocketError);
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
    const configuredChannelId = (process.env.SHIPROCKET_CHANNEL_ID || '').trim();

    return {
        order_id: `silver-strix-${order._id.toString().slice(-10)}`,
        order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
        pickup_location: defaults.pickupLocation,
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
        shipping_is_billing: 1,
        ...(configuredChannelId ? { channel_id: configuredChannelId } : {}),
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

const attemptAutoShiprocketSync = async (orderId, trigger = 'system') => {
    if (isShiprocketDisabled()) {
        return { skipped: true, reason: 'shiprocket-under-maintenance' };
    }

    if (!orderId) {
        return { skipped: true, reason: 'missing-order-id' };
    }

    const order = await Order.findById(orderId).populate('items.product', 'name slug packageDetails');
    if (!order) {
        return { skipped: true, reason: 'order-not-found' };
    }

    if (order.orderStatus === 'cancelled') {
        return { skipped: true, reason: 'cancelled-order' };
    }

    if (!['confirmed', 'processing'].includes(order.orderStatus)) {
        return { skipped: true, reason: `status-${order.orderStatus || 'unknown'}-not-eligible` };
    }

    if (order.shiprocketShipmentId) {
        return { skipped: true, reason: 'shipment-already-exists', order };
    }

    if (!order.shippingAddress?.street || !order.shippingAddress?.city || !order.shippingAddress?.state || !order.shippingAddress?.zipCode || !order.shippingAddress?.phone || !order.shippingAddress?.email) {
        return { skipped: true, reason: 'missing-shipping-address', order };
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
            const awbCode = String(
                awbResponse?.response?.data?.awb_code ||
                awbResponse?.awb_code ||
                awbResponse?.data?.awb_code ||
                ''
            ) || '';
            order.shiprocketAwbCode = awbCode || order.shiprocketAwbCode;
            order.shiprocketCourierName =
                awbResponse?.response?.data?.courier_name ||
                awbResponse?.courier_name ||
                awbResponse?.data?.courier_name ||
                order.shiprocketCourierName;

            if (awbCode) {
                order.shiprocketTrackingStatus = 'awb_assigned';
                order.shiprocketTrackingPayload = {
                    ...(order.shiprocketTrackingPayload || {}),
                    lastSyncTrigger: trigger,
                    awbAssignment: awbResponse,
                };
            } else {
                order.shiprocketTrackingStatus = 'awb_pending';
                order.shiprocketTrackingPayload = {
                    ...(order.shiprocketTrackingPayload || {}),
                    lastSyncTrigger: trigger,
                    awbAssignment: awbResponse,
                    syncNote: 'Shipment created but AWB was not assigned yet, so pickup was skipped.',
                };
            }
        } catch (awbError) {
            console.warn(`Shiprocket AWB assignment failed (${trigger}):`, awbError.message);
            order.shiprocketTrackingStatus = 'awb_pending';
            order.shiprocketTrackingPayload = {
                ...(order.shiprocketTrackingPayload || {}),
                lastSyncTrigger: trigger,
                awbAssignmentError: awbError.message || 'AWB assignment failed',
                syncNote: 'Shipment created but AWB assignment failed, so pickup was skipped.',
            };
        }

        if (order.shiprocketAwbCode) {
            try {
                const pickupResponse = await generatePickup({ shipmentId: order.shiprocketShipmentId });
                order.shiprocketTrackingPayload = {
                    ...(order.shiprocketTrackingPayload || {}),
                    lastSyncTrigger: trigger,
                    pickupGeneration: pickupResponse,
                };
            } catch (pickupError) {
                console.warn(`Shiprocket pickup generation failed (${trigger}):`, pickupError.message);
                order.shiprocketTrackingPayload = {
                    ...(order.shiprocketTrackingPayload || {}),
                    lastSyncTrigger: trigger,
                    pickupGenerationError: pickupError.message || 'Pickup generation failed',
                };
            }
        }
    }

    await order.save();
    return { skipped: false, order, createResponse };
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

const syncCashfreePaymentStatus = async (order) => {
    if (!order?.paymentGatewayOrderId || order?.paymentGateway !== 'cashfree') {
        return {
            status: order?.paymentStatus || 'pending',
            gatewayOrderStatus: null,
            order,
        };
    }

    const client = getCashfreeClient();
    const [orderResponse, paymentsResponse] = await Promise.all([
        client.PGFetchOrder(order.paymentGatewayOrderId),
        client.PGOrderFetchPayments(order.paymentGatewayOrderId)
    ]);

    const gatewayOrderStatus = orderResponse.data?.order_status || null;
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

        return {
            status: 'paid',
            gatewayOrderStatus: gatewayOrderStatus || 'PAID',
            order,
        };
    }

    if (failedPayment && ['FAILED', 'EXPIRED', 'TERMINATED'].includes(gatewayOrderStatus || '')) {
        order.paymentStatus = 'failed';
        if (['pending', 'confirmed'].includes(order.orderStatus || 'pending')) {
            order.orderStatus = 'cancelled';
        }
        await order.save();

        return {
            status: 'failed',
            gatewayOrderStatus: gatewayOrderStatus || 'FAILED',
            order,
        };
    }

    return {
        status: order.paymentStatus || 'pending',
        gatewayOrderStatus: gatewayOrderStatus || 'ACTIVE',
        order,
    };
};

// Get user orders
router.get('/', auth, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .populate('items.product', 'name images price')
            .sort('-createdAt');

        for (const order of orders) {
            const shouldSyncPayment =
                order.paymentGateway === 'cashfree' &&
                order.paymentGatewayOrderId &&
                order.paymentStatus !== 'paid';

            if (!shouldSyncPayment) {
                continue;
            }

            try {
                await syncCashfreePaymentStatus(order);
            } catch (syncError) {
                console.warn(`Cashfree payment sync skipped for order ${order._id}:`, syncError.message || syncError);
            }
        }

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
        const returnUrl = `${getFrontendBaseUrl(req)}/checkout?cashfree=return&order_id=${order._id.toString()}`;
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
                payment_methods: paymentMethod === 'upi' ? 'upi' : 'cc,dc,upi',
                return_url: returnUrl
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
            paymentGatewayOrderId: response.data.order_id,
            returnUrl
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

        const paymentState = await syncCashfreePaymentStatus(order);
        res.json({
            status: paymentState.status,
            gatewayOrderStatus: paymentState.gatewayOrderStatus,
            order: paymentState.order
        });
    } catch (error) {
        console.error('Payment status fetch error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch payment status' });
    }
});

router.get('/:id/invoice', auth, async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
            .populate('items.product', 'name');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if ((order.paymentStatus || 'pending') === 'failed') {
            return res.status(400).json({ error: 'Invoice is not available for failed payment attempts.' });
        }

        const format = String(req.query.format || 'html').toLowerCase();
        const shouldDownload = req.query.download === 'true';

        if (format === 'pdf') {
            const pdfBuffer = await generateInvoicePdfBuffer(order);
            const filename = getInvoiceFileName(order, 'pdf');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `${shouldDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
            return res.send(pdfBuffer);
        }

        const html = await buildInvoiceHtml(order, { showActions: !shouldDownload });
        const filename = getInvoiceFileName(order, 'html');

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (shouldDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }

        return res.send(html);
    } catch (error) {
        console.error('Invoice generation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate invoice' });
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

        await finalizePaidOrder(order);

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

router.post(
    '/:id/refund-request',
    auth,
    refundUpload.fields([
        { name: 'images', maxCount: 5 },
        { name: 'video', maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            const existingStatus = order.refundRequest?.status || 'none';
            if (existingStatus !== 'none') {
                return res.status(400).json({ error: `A refund workflow already exists for this order (${getRefundStateLabel(existingStatus)}).` });
            }

            const eligibility = await getRefundEligibility(order);
            if (!eligibility.eligible) {
                return res.status(400).json({
                    error: eligibility.reason === 'refund-window-expired'
                        ? `Refund or return requests are only allowed within ${eligibility.refundWindowDays} days of delivery.`
                        : 'Refund requests are available only after the order is delivered.',
                    reason: eligibility.reason,
                    eligibleUntil: eligibility.eligibleUntil,
                });
            }

            const customerMessage = String(req.body.message || '').trim();
            const policyAccepted = String(req.body.policyAccepted || '').trim() === 'true';
            const imageFiles = Array.isArray(req.files?.images) ? req.files.images : [];
            const videoFiles = Array.isArray(req.files?.video) ? req.files.video : [];

            if (!customerMessage || customerMessage.length < 20) {
                return res.status(400).json({ error: 'Please describe the defect or issue in at least 20 characters.' });
            }

            if (!policyAccepted) {
                return res.status(400).json({ error: 'Please confirm the refund and return terms before submitting the request.' });
            }

            if (imageFiles.length === 0) {
                return res.status(400).json({ error: 'Please upload at least one product photo as refund evidence.' });
            }

            if (videoFiles.length === 0) {
                return res.status(400).json({ error: 'Please upload one product video as refund evidence.' });
            }

            const evidenceImages = await Promise.all(
                imageFiles.map((file) => uploadBufferToCloudinary(file, 'silver-strix/refunds/images', 'image'))
            );
            const evidenceVideo = await uploadBufferToCloudinary(videoFiles[0], 'silver-strix/refunds/videos', 'video');

            order.refundRequest = {
                ...order.refundRequest?.toObject?.(),
                status: 'requested',
                requestedAt: new Date(),
                eligibleUntil: eligibility.eligibleUntil,
                customerMessage,
                policyAccepted: true,
                evidenceImages,
                evidenceVideo,
                adminDecisionNote: '',
                adminReviewedAt: null,
                adminReviewedBy: null,
                returnApprovedAt: null,
                returnApprovedBy: null,
                returnReceivedAt: null,
                returnReceivedBy: null,
                refundAmount: Number(order.total || 0),
                refundNote: '',
                refundApprovedAt: null,
                refundApprovedBy: null,
                refundInitiatedAt: null,
                refundCompletedAt: null,
                refundRejectedAt: null,
                refundRejectedBy: null,
                refundReference: null,
                refundGatewayProvider: null,
                refundGatewayRefundId: null,
                refundGatewayCfRefundId: null,
                refundGatewayStatus: null,
                refundGatewayResponse: null,
            };

            await order.save();
            res.status(201).json({
                message: 'Refund request submitted successfully. Our team will review it shortly.',
                order,
            });
        } catch (error) {
            console.error('Refund request submission error:', error);
            res.status(500).json({ error: error.message || 'Failed to submit refund request' });
        }
    }
);

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

router.get('/admin/:id/invoice', adminAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items.product', 'name');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if ((order.paymentStatus || 'pending') === 'failed') {
            return res.status(400).json({ error: 'Invoice is not available for failed payment attempts.' });
        }

        const format = String(req.query.format || 'html').toLowerCase();
        const shouldDownload = req.query.download === 'true';

        if (format === 'pdf') {
            const pdfBuffer = await generateInvoicePdfBuffer(order);
            const filename = getInvoiceFileName(order, 'pdf');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `${shouldDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
            return res.send(pdfBuffer);
        }

        const html = await buildInvoiceHtml(order, { showActions: !shouldDownload });
        const filename = getInvoiceFileName(order, 'html');

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (shouldDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }

        return res.send(html);
    } catch (error) {
        console.error('Admin invoice generation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate invoice' });
    }
});

router.post('/admin/:id/refund/review', adminAuth, async (req, res) => {
    try {
        const { action, adminNote } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if ((order.refundRequest?.status || 'none') !== 'requested') {
            return res.status(400).json({ error: 'Only newly requested refunds can be reviewed.' });
        }

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'Invalid review action.' });
        }

        order.refundRequest.adminDecisionNote = String(adminNote || '').trim();
        order.refundRequest.adminReviewedAt = new Date();
        order.refundRequest.adminReviewedBy = req.user._id;

        if (action === 'approve') {
            order.refundRequest.status = 'return_approved';
            order.refundRequest.returnApprovedAt = new Date();
            order.refundRequest.returnApprovedBy = req.user._id;
        } else {
            order.refundRequest.status = 'rejected';
            order.refundRequest.refundRejectedAt = new Date();
            order.refundRequest.refundRejectedBy = req.user._id;
        }

        await order.save();
        res.json({
            message: action === 'approve' ? 'Return request approved.' : 'Refund request rejected.',
            order,
        });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to review refund request' });
    }
});

router.post('/admin/:id/refund/mark-return-received', adminAuth, async (req, res) => {
    try {
        const { adminNote } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if ((order.refundRequest?.status || 'none') !== 'return_approved') {
            return res.status(400).json({ error: 'Only approved return requests can be marked as received.' });
        }

        order.refundRequest.status = 'refund_pending';
        order.refundRequest.returnReceivedAt = new Date();
        order.refundRequest.returnReceivedBy = req.user._id;
        if (adminNote) {
            order.refundRequest.adminDecisionNote = String(adminNote).trim();
        }

        await order.save();
        res.json({ message: 'Returned product marked as received.', order });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to mark return as received' });
    }
});

router.post('/admin/:id/refund/initiate', adminAuth, async (req, res) => {
    try {
        const { refundAmount, adminNote } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if ((order.refundRequest?.status || 'none') !== 'refund_pending') {
            return res.status(400).json({ error: 'Refund can be initiated only after the returned product is received and accepted.' });
        }

        const amountSource = refundAmount ?? order.refundRequest?.refundAmount ?? order.total ?? 0;
        const amount = Number(amountSource);
        if (!Number.isFinite(amount) || amount <= 0 || amount > Number(order.total || 0)) {
            return res.status(400).json({ error: 'Refund amount must be greater than 0 and not exceed the order total.' });
        }

        order.refundRequest.refundAmount = amount;
        order.refundRequest.refundNote = String(adminNote || '').trim();
        order.refundRequest.refundApprovedAt = new Date();
        order.refundRequest.refundApprovedBy = req.user._id;
        order.refundRequest.refundInitiatedAt = new Date();
        order.refundRequest.status = 'refund_initiated';

        const canUseCashfreeRefund =
            order.paymentGateway === 'cashfree' &&
            order.paymentStatus === 'paid' &&
            order.paymentGatewayOrderId;

        if (!canUseCashfreeRefund) {
            return res.status(400).json({
                error: 'Automatic refund can be initiated only for prepaid orders processed through Cashfree.',
            });
        }

        const refundId = `refund_${order._id.toString().slice(-10)}_${Date.now()}`;
        const client = getCashfreeClient();
        const refundResponse = await client.PGOrderCreateRefund(order.paymentGatewayOrderId, {
            refund_id: refundId,
            refund_amount: Number(amount.toFixed(2)),
            refund_note: order.refundRequest.refundNote || `Refund for order ${order._id.toString().slice(-8)}`,
        });

        order.refundRequest.refundGatewayProvider = 'cashfree';
        order.refundRequest.refundGatewayRefundId = refundResponse?.data?.refund_id || refundResponse?.data?.cf_refund_id || refundId;
        order.refundRequest.refundGatewayCfRefundId = refundResponse?.data?.cf_refund_id || null;
        applyRefundGatewayStatus(order, refundResponse?.data || refundResponse);

        await order.save();
        res.json({ message: 'Cashfree refund initiated successfully.', order });
    } catch (error) {
        console.error('Refund initiation error:', error);
        res.status(500).json({ error: error.message || 'Failed to initiate refund' });
    }
});

router.get('/admin/:id/refund/sync', adminAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.refundRequest?.refundGatewayProvider !== 'cashfree' || !order.refundRequest?.refundGatewayRefundId || !order.paymentGatewayOrderId) {
            return res.status(400).json({ error: 'This order does not have a Cashfree refund to sync.' });
        }

        const client = getCashfreeClient();
        const refundResponse = await client.PGOrderFetchRefund(order.paymentGatewayOrderId, order.refundRequest.refundGatewayRefundId);
        applyRefundGatewayStatus(order, refundResponse?.data || refundResponse);
        await order.save();

        res.json({ message: 'Refund status synced.', order, refund: refundResponse?.data || refundResponse });
    } catch (error) {
        console.error('Refund sync error:', error);
        res.status(500).json({ error: error.message || 'Failed to sync refund status' });
    }
});

router.post('/admin/:id/refund/complete', adminAuth, async (req, res) => {
    try {
        const { reference, adminNote } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!['refund_initiated', 'refund_pending'].includes(order.refundRequest?.status || 'none')) {
            return res.status(400).json({ error: 'Only initiated or pending refunds can be completed.' });
        }

        order.refundRequest.status = 'refund_completed';
        order.refundRequest.refundCompletedAt = new Date();
        order.refundRequest.refundReference = String(reference || order.refundRequest?.refundReference || '').trim() || order.refundRequest?.refundReference;
        order.refundRequest.refundGatewayProvider = order.refundRequest?.refundGatewayProvider || 'manual';
        order.refundRequest.refundGatewayStatus = order.refundRequest?.refundGatewayProvider === 'cashfree'
            ? (order.refundRequest.refundGatewayStatus || 'SUCCESS')
            : 'MANUAL_COMPLETED';
        if (adminNote) {
            order.refundRequest.refundNote = String(adminNote).trim();
        }

        await order.save();
        res.json({ message: 'Refund marked as completed.', order });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to complete refund' });
    }
});

router.post('/admin/:id/shiprocket/create', adminAuth, async (req, res) => {
    try {
        if (isShiprocketDisabled()) {
            return res.status(503).json({ error: SHIPROCKET_MAINTENANCE_MESSAGE, maintenance: true });
        }

        const result = await attemptAutoShiprocketSync(req.params.id, 'admin-manual-create');
        if (result.reason === 'order-not-found') {
            return res.status(404).json({ error: 'Order not found' });
        }
        if (result.reason === 'cancelled-order') {
            return res.status(400).json({ error: 'Cancelled orders cannot be shipped via Shiprocket.' });
        }
        if (result.reason === 'missing-shipping-address') {
            return res.status(400).json({ error: 'Order is missing required shipping address details for Shiprocket.' });
        }
        if (result.reason === 'shipment-already-exists') {
            return res.json({ message: 'Shiprocket shipment already exists for this order.', order: result.order });
        }
        if (result.skipped) {
            return res.status(400).json({ error: `Order is not ready for Shiprocket sync yet (${result.reason}).` });
        }

        res.json({ message: 'Shiprocket shipment created successfully.', order: result.order });
    } catch (error) {
        console.error('Shiprocket shipment creation error:', error);
        res.status(500).json({ error: error.message || 'Failed to create Shiprocket shipment' });
    }
});

router.get('/admin/:id/shiprocket/track', adminAuth, async (req, res) => {
    try {
        if (isShiprocketDisabled()) {
            return res.status(503).json({ error: SHIPROCKET_MAINTENANCE_MESSAGE, maintenance: true });
        }

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
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const previousStatus = order.orderStatus;
        if (orderStatus !== undefined) {
            order.orderStatus = orderStatus;
            if (orderStatus === 'delivered' && !order.deliveredAt) {
                order.deliveredAt = new Date();
            }
        }
        if (paymentStatus !== undefined) {
            order.paymentStatus = paymentStatus;
        }
        await order.save();

        let shiprocketSync = null;
        if (
            !isShiprocketDisabled() &&
            !order.shiprocketShipmentId &&
            order.orderStatus === 'confirmed' &&
            previousStatus !== 'confirmed'
        ) {
            try {
                shiprocketSync = await attemptAutoShiprocketSync(order._id, 'admin-status-update');
            } catch (shiprocketError) {
                shiprocketSync = {
                    skipped: true,
                    reason: shiprocketError.message || 'shiprocket-sync-failed'
                };
            }
        }

        const freshOrder = await Order.findById(req.params.id);
        if (orderStatus !== undefined && previousStatus !== order.orderStatus && freshOrder) {
            if (order.orderStatus === 'confirmed') {
                await sendOrderConfirmationEmail(
                    freshOrder,
                    freshOrder.shippingAddress?.email,
                    freshOrder.shippingAddress?.name
                );
            } else {
                await sendOrderStatusUpdateEmail(freshOrder);
            }
        }
        res.json({ message: 'Order status updated', order: freshOrder, shiprocketSync });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const friendly = err.code === 'LIMIT_FILE_SIZE'
            ? 'Refund evidence file is too large. Please upload a smaller image or video.'
            : err.message;
        return res.status(400).json({ error: friendly });
    }

    if (err && err.message === 'Only image and video files are allowed for refund evidence.') {
        return res.status(400).json({ error: err.message });
    }

    return next(err);
});

module.exports = router;

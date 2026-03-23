const express = require('express');
const Subscriber = require('../models/Subscriber');
const NewsletterTemplate = require('../models/NewsletterTemplate');
const { adminAuth } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

const router = express.Router();

// Public subscribe
router.post('/subscribe', async (req, res) => {
    try {
        const email = (req.body.email || '').toString().trim().toLowerCase();
        const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        const existing = await Subscriber.findOne({ email });
        if (existing) return res.json({ message: 'Already subscribed' });
        await Subscriber.create({ email });

        // Confirmation email (simple default)
        try {
            await sendEmail({
                to: email,
                subject: 'Welcome to Silver Strix Newsletter',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 640px; margin:0 auto; padding:24px; background:#ffffff; border-radius:12px;">
                        <h2 style="margin:0 0 12px 0; color:#0a1f44;">Thanks for subscribing!</h2>
                        <p style="margin:0 0 12px 0; color:#374151;">You’ll now receive updates on new launches, offers and curated fragrance tips.</p>
                        <p style="margin:0; color:#6b7280; font-size:13px;">If you didn’t subscribe, you can ignore this email.</p>
                    </div>
                `
            });
        } catch (err) {
            console.error('Newsletter confirmation email failed:', err.message);
        }

        res.status(201).json({ message: 'Subscribed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin list
router.get('/', adminAuth, async (req, res) => {
    try {
        const subs = await Subscriber.find().sort({ createdAt: -1 });
        res.json({ subscribers: subs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin delete
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        await Subscriber.findByIdAndDelete(req.params.id);
        res.json({ message: 'Subscriber removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Templates: list
router.get('/templates', adminAuth, async (_req, res) => {
    try {
        const templates = await NewsletterTemplate.find().sort({ updatedAt: -1 });
        res.json({ templates });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Templates: create
router.post('/templates', adminAuth, async (req, res) => {
    try {
        const { name, subject, html } = req.body;
        const template = await NewsletterTemplate.create({ name, subject, html });
        res.status(201).json({ template });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Templates: update
router.put('/templates/:id', adminAuth, async (req, res) => {
    try {
        const { name, subject, html } = req.body;
        const template = await NewsletterTemplate.findByIdAndUpdate(
            req.params.id,
            { name, subject, html },
            { new: true }
        );
        res.json({ template });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Templates: delete
router.delete('/templates/:id', adminAuth, async (req, res) => {
    try {
        await NewsletterTemplate.findByIdAndDelete(req.params.id);
        res.json({ message: 'Template deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: send template to subscriber
router.post('/send', adminAuth, async (req, res) => {
    try {
        const { subscriberId, email, templateId } = req.body;
        const targetEmail = email || (await Subscriber.findById(subscriberId))?.email;
        if (!targetEmail) return res.status(400).json({ error: 'Target email required' });
        const template = await NewsletterTemplate.findById(templateId);
        if (!template) return res.status(404).json({ error: 'Template not found' });

        await sendEmail({
            to: targetEmail,
            subject: template.subject,
            html: template.html
        });

        res.json({ message: `Email sent to ${targetEmail}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

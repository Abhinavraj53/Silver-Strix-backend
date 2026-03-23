const express = require('express');
const slugify = require('slugify');
const Attribute = require('../models/Attribute');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all attributes
router.get('/', async (req, res) => {
    try {
        const attributes = await Attribute.find().sort({ name: 1 });
        res.json({ attributes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create attribute
router.post('/', adminAuth, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const slug = slugify(name, { lower: true });
        const existing = await Attribute.findOne({ slug });
        if (existing) return res.status(400).json({ error: 'Attribute already exists' });
        const attribute = await Attribute.create({ name, slug });
        res.status(201).json({ attribute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete attribute
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        await Attribute.findByIdAndDelete(req.params.id);
        res.json({ message: 'Attribute deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

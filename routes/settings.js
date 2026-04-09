const express = require('express');
const Settings = require('../models/Settings');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin'];

const normalizeSocialSettingsPayload = (payload = {}) => {
    const normalized = { ...payload };
    const socialLinks = {};

    for (const platform of SOCIAL_PLATFORMS) {
        const legacyKey = `${platform}Url`;
        const entry = payload.socialLinks?.[platform] || {};
        const legacyUrl = typeof payload[legacyKey] === 'string' ? payload[legacyKey] : '';
        const hasExplicitEntry = typeof entry.url === 'string' || typeof entry.enabled === 'boolean';

        socialLinks[platform] = hasExplicitEntry
            ? {
                url: typeof entry.url === 'string' ? entry.url : '',
                enabled: typeof entry.enabled === 'boolean' ? entry.enabled : false,
            }
            : {
                url: legacyUrl,
                enabled: Boolean(legacyUrl),
            };

        normalized[legacyKey] = socialLinks[platform].url;
    }

    normalized.socialLinks = socialLinks;
    return normalized;
};

// Get settings (public)
router.get('/', async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        const normalizedSettings = normalizeSocialSettingsPayload(settings.toObject ? settings.toObject() : settings);
        res.json({ settings: normalizedSettings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings (admin only)
router.put('/', adminAuth, async (req, res) => {
    try {
        const payload = normalizeSocialSettingsPayload(req.body);
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings(payload);
        } else {
            Object.assign(settings, payload);
            settings.updatedAt = Date.now();
        }
        
        await settings.save();
        res.json({ message: 'Settings updated successfully', settings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

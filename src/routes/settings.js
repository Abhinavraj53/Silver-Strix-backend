import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const SETTINGS_ID = new ObjectId('000000000000000000000001'); // fixed id for single doc

router.get('/', async (_req, res) => {
  try {
    const db = getDB();
    const settings = await db.collection('settings').findOne({ _id: SETTINGS_ID });
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const doc = {
      logo_url: req.body.logo_url || '',
      meta_title: req.body.meta_title || '',
      meta_description: req.body.meta_description || '',
      contact_email: req.body.contact_email || '',
      contact_phone: req.body.contact_phone || '',
      address: req.body.address || '',
      social_links: req.body.social_links || {},
      hero_title: req.body.hero_title || '',
      hero_subtitle: req.body.hero_subtitle || '',
      updated_at: new Date().toISOString(),
    };

    await db.collection('settings').updateOne(
      { _id: SETTINGS_ID },
      { $set: doc, $setOnInsert: { _id: SETTINGS_ID, created_at: new Date().toISOString() } },
      { upsert: true }
    );

    const saved = await db.collection('settings').findOne({ _id: SETTINGS_ID });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

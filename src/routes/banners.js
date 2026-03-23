import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const banners = await db
      .collection('banners')
      .find({ active: true })
      .sort({ sort_order: 1, created_at: -1 })
      .toArray();
    res.json(banners.map((b) => ({ ...b, id: b._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/all', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin access required' });
    const banners = await db.collection('banners').find().sort({ sort_order: 1, created_at: -1 }).toArray();
    res.json(banners.map((b) => ({ ...b, id: b._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const now = new Date().toISOString();
    const banner = {
      title: req.body.title || '',
      subtitle: req.body.subtitle || '',
      image_url: req.body.image_url || '',
      link_url: req.body.link_url || '',
      active: req.body.active ?? true,
      sort_order: Number(req.body.sort_order) || 0,
      starts_at: req.body.starts_at || null,
      ends_at: req.body.ends_at || null,
      created_at: now,
      updated_at: now,
    };
    const result = await db.collection('banners').insertOne(banner);
    res.status(201).json({ ...banner, id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const update = { ...req.body, updated_at: new Date().toISOString() };
    await db.collection('banners').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    const banner = await db.collection('banners').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ ...banner, id: banner._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    await db.collection('banners').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

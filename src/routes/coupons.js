import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function requireAdmin(user) {
  return user?.is_admin;
}

// List coupons
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!requireAdmin(me)) return res.status(403).json({ error: 'Admin access required' });

    const coupons = await db.collection('coupons').find().sort({ created_at: -1 }).toArray();
    res.json(coupons.map((c) => ({ ...c, id: c._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create coupon
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!requireAdmin(me)) return res.status(403).json({ error: 'Admin access required' });

    const now = new Date().toISOString();
    const coupon = {
      code: req.body.code?.toUpperCase(),
      type: req.body.type || 'percent', // percent | fixed
      value: Number(req.body.value) || 0,
      min_order: Number(req.body.min_order) || 0,
      max_discount: req.body.max_discount ? Number(req.body.max_discount) : null,
      starts_at: req.body.starts_at || null,
      ends_at: req.body.ends_at || null,
      active: req.body.active ?? true,
      created_at: now,
      updated_at: now,
    };

    const existing = await db.collection('coupons').findOne({ code: coupon.code });
    if (existing) return res.status(400).json({ error: 'Coupon code already exists' });

    const result = await db.collection('coupons').insertOne(coupon);
    res.status(201).json({ ...coupon, id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update coupon
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!requireAdmin(me)) return res.status(403).json({ error: 'Admin access required' });

    const update = {
      ...req.body,
      updated_at: new Date().toISOString(),
    };
    if (update.code) update.code = update.code.toUpperCase();

    await db.collection('coupons').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    const coupon = await db.collection('coupons').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ ...coupon, id: coupon._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete coupon
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const me = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!requireAdmin(me)) return res.status(403).json({ error: 'Admin access required' });

    await db.collection('coupons').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const items = await db.collection('cart_items')
      .find({ user_id: req.userId })
      .toArray();

    const productIds = items
      .map(item => {
        try { return new ObjectId(item.product_id); } catch { return null; }
      })
      .filter(Boolean);

    const products = productIds.length > 0
      ? await db.collection('products').find({ _id: { $in: productIds } }).toArray()
      : [];

    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = { ...p, id: p._id.toString() }; });

    const result = items.map(item => ({
      ...item,
      id: item._id.toString(),
      product: productMap[item.product_id] || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { product_id, quantity = 1 } = req.body;
    const db = getDB();

    const existing = await db.collection('cart_items').findOne({
      user_id: req.userId,
      product_id,
    });

    if (existing) {
      await db.collection('cart_items').updateOne(
        { _id: existing._id },
        { $set: { quantity: existing.quantity + quantity } }
      );
    } else {
      await db.collection('cart_items').insertOne({
        user_id: req.userId,
        product_id,
        quantity,
        created_at: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { quantity } = req.body;
    const db = getDB();

    if (quantity <= 0) {
      await db.collection('cart_items').deleteOne({
        _id: new ObjectId(req.params.id),
        user_id: req.userId,
      });
    } else {
      await db.collection('cart_items').updateOne(
        { _id: new ObjectId(req.params.id), user_id: req.userId },
        { $set: { quantity } }
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('cart_items').deleteOne({
      _id: new ObjectId(req.params.id),
      user_id: req.userId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('cart_items').deleteMany({ user_id: req.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

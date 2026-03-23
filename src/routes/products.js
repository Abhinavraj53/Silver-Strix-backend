import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const { active_only } = req.query;
    const filter = active_only === 'true' ? { is_active: true } : {};
    const products = await db.collection('products')
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    res.json(products.map(p => ({ ...p, id: p._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const db = getDB();
    const product = await db.collection('products').findOne({ slug: req.params.slug });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ ...product, id: product._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const now = new Date().toISOString();
    const product = {
      ...req.body,
      slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, '-'),
      created_at: now,
      updated_at: now,
    };

    const result = await db.collection('products').insertOne(product);
    res.status(201).json({ ...product, id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { id, _id, ...updateData } = req.body;
    updateData.updated_at = new Date().toISOString();

    await db.collection('products').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );

    const product = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ ...product, id: product._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    await db.collection('products').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

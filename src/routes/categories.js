import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const categories = await db.collection('categories')
      .find()
      .sort({ created_at: -1 })
      .toArray();

    res.json(categories.map(c => ({ ...c, id: c._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const category = {
      ...req.body,
      slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, '-'),
      created_at: new Date().toISOString(),
    };

    const result = await db.collection('categories').insertOne(category);
    res.status(201).json({ ...category, id: result.insertedId.toString() });
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
    await db.collection('categories').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );

    const category = await db.collection('categories').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ ...category, id: category._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    await db.collection('categories').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

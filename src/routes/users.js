import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// List users with optional pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      db.collection('users').countDocuments(),
      db
        .collection('users')
        .find({}, { projection: { password: 0 } })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    res.json({
      total,
      page,
      limit,
      users: users.map((u) => ({ ...u, id: u._id.toString() })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Single user details
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const requester = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!requester?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(req.params.id) }, { projection: { password: 0 } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ ...user, id: user._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

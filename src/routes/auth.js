import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDB();
    const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'User already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    const user = {
      email: email.toLowerCase(),
      password: hashedPassword,
      full_name,
      phone: null,
      address: null,
      city: null,
      state: null,
      pincode: null,
      is_admin: false,
      created_at: now,
      updated_at: now,
    };

    const result = await db.collection('users').insertOne(user);
    const token = generateToken(result.insertedId.toString());

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({
      token,
      user: { ...userWithoutPassword, id: result.insertedId.toString() },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDB();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const token = generateToken(user._id.toString());
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: { ...userWithoutPassword, id: user._id.toString() },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Dedicated admin login route to enforce is_admin
router.post('/admin/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDB();
    const user = await db.collection('users').findOne({ email: email.toLowerCase(), is_admin: true });
    if (!user) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const token = generateToken(user._id.toString());
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: { ...userWithoutPassword, id: user._id.toString() },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ ...user, id: user._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { full_name, phone, address, city, state, pincode } = req.body;
    const db = getDB();

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      {
        $set: {
          full_name,
          phone,
          address,
          city,
          state,
          pincode,
          updated_at: new Date().toISOString(),
        },
      }
    );

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    res.json({ ...user, id: user._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

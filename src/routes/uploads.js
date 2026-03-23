import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { uploadImage } from '../services/cloudinary.js';
import { getDB } from '../db.js';
import { ObjectId } from 'mongodb';

const router = Router();

router.post('/image', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { image, folder } = req.body;
    if (!image) return res.status(400).json({ error: 'Image is required' });

    const result = await uploadImage(image, folder || 'silver-strix/products');
    res.json({ url: result.url, public_id: result.public_id });
  } catch (err) {
    res.status(500).json({ error: 'Image upload failed' });
  }
});

export default router;

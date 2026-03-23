import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });

    let filter = {};
    if (!user?.is_admin) {
      filter = { user_id: req.userId };
    }

    const orders = await db.collection('orders')
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    const allOrderIds = orders.map(o => o._id.toString());
    const orderItems = await db.collection('order_items')
      .find({ order_id: { $in: allOrderIds } })
      .toArray();

    const productIds = [...new Set(orderItems.map(item => item.product_id))];
    const validProductIds = productIds
      .map(id => { try { return new ObjectId(id); } catch { return null; } })
      .filter(Boolean);

    const products = validProductIds.length > 0
      ? await db.collection('products').find({ _id: { $in: validProductIds } }).toArray()
      : [];

    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = { ...p, id: p._id.toString() }; });

    const userIds = [...new Set(orders.map(o => o.user_id))];
    const validUserIds = userIds
      .map(id => { try { return new ObjectId(id); } catch { return null; } })
      .filter(Boolean);

    const users = validUserIds.length > 0
      ? await db.collection('users').find(
          { _id: { $in: validUserIds } },
          { projection: { password: 0 } }
        ).toArray()
      : [];

    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = { ...u, id: u._id.toString() }; });

    const result = orders.map(order => {
      const items = orderItems
        .filter(item => item.order_id === order._id.toString())
        .map(item => ({
          ...item,
          id: item._id.toString(),
          product: productMap[item.product_id] || null,
        }));

      return {
        ...order,
        id: order._id.toString(),
        order_items: items,
        user: userMap[order.user_id] || null,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { total, shipping_address, payment_method, notes, items } = req.body;
    const db = getDB();
    const now = new Date().toISOString();

    const order = {
      user_id: req.userId,
      status: 'pending',
      total,
      shipping_address,
      payment_method,
      payment_status: 'pending',
      notes: notes || null,
      created_at: now,
      updated_at: now,
    };

    const result = await db.collection('orders').insertOne(order);
    const orderId = result.insertedId.toString();

    if (items && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        created_at: now,
      }));
      await db.collection('order_items').insertMany(orderItems);
    }

    await db.collection('cart_items').deleteMany({ user_id: req.userId });

    res.status(201).json({ ...order, id: orderId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updated_at: new Date().toISOString() } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const [productCount, orders] = await Promise.all([
      db.collection('products').countDocuments(),
      db.collection('orders').find().toArray(),
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingOrders = orders.filter(o => o.status === 'pending').length;

    res.json({
      totalProducts: productCount,
      totalOrders: orders.length,
      totalRevenue,
      pendingOrders,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Single order detail (admin or owner)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const requester = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });

    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!requester?.is_admin && order.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const orderItems = await db.collection('order_items').find({ order_id: order._id.toString() }).toArray();
    const productIds = [...new Set(orderItems.map((i) => i.product_id))]
      .map((id) => { try { return new ObjectId(id); } catch { return null; } })
      .filter(Boolean);
    const products = productIds.length
      ? await db.collection('products').find({ _id: { $in: productIds } }).toArray()
      : [];
    const productMap = {};
    products.forEach((p) => { productMap[p._id.toString()] = { ...p, id: p._id.toString() }; });

    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(order.user_id) }, { projection: { password: 0 } });

    const items = orderItems.map((item) => ({
      ...item,
      id: item._id.toString(),
      product: productMap[item.product_id] || null,
    }));

    res.json({
      ...order,
      id: order._id.toString(),
      order_items: items,
      user: user ? { ...user, id: user._id.toString() } : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

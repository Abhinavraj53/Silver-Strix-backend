import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const dateFrom = req.query.date_from ? new Date(req.query.date_from) : new Date(Date.now() - 30 * 86400000);
    const dateTo = req.query.date_to ? new Date(req.query.date_to) : new Date();

    const orders = await db
      .collection('orders')
      .find({ created_at: { $gte: dateFrom.toISOString(), $lte: dateTo.toISOString() }, status: { $ne: 'cancelled' } })
      .toArray();

    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const orderCount = orders.length;

    const orderIds = orders.map((o) => o._id.toString());
    const items = orderIds.length
      ? await db.collection('order_items').find({ order_id: { $in: orderIds } }).toArray()
      : [];

    const productAgg = {};
    items.forEach((it) => {
      productAgg[it.product_id] = productAgg[it.product_id] || { qty: 0, revenue: 0 };
      productAgg[it.product_id].qty += it.quantity;
      productAgg[it.product_id].revenue += it.price * it.quantity;
    });

    const topProductIds = Object.keys(productAgg)
      .map((id) => ({ id, ...productAgg[id] }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const productDocs =
      topProductIds.length > 0
        ? await db
            .collection('products')
            .find({ _id: { $in: topProductIds.map((p) => new ObjectId(p.id)) } })
            .toArray()
        : [];
    const productNameMap = Object.fromEntries(productDocs.map((p) => [p._id.toString(), p.name]));

    const byDayMap = {};
    orders.forEach((o) => {
      const day = o.created_at?.slice(0, 10) || '';
      byDayMap[day] = byDayMap[day] || { date: day, revenue: 0, orders: 0 };
      byDayMap[day].revenue += o.total || 0;
      byDayMap[day].orders += 1;
    });

    res.json({
      range: { date_from: dateFrom.toISOString(), date_to: dateTo.toISOString() },
      summary: { revenue, orders: orderCount, aov: orderCount ? revenue / orderCount : 0 },
      by_day: Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date)),
      top_products: topProductIds.map((p) => ({
        ...p,
        name: productNameMap[p.id] || 'Unknown',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

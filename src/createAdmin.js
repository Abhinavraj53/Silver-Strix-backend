import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB } from './db.js';

async function ensureAdmin() {
  const db = await connectDB();

  const email = (process.env.ADMIN_EMAIL || 'admin@silverstrix.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345!';
  const fullName = process.env.ADMIN_FULL_NAME || 'Admin User';

  const now = new Date().toISOString();
  const hashedPassword = await bcrypt.hash(password, 12);

  const existing = await db.collection('users').findOne({ email });

  if (existing) {
    await db.collection('users').updateOne(
      { _id: existing._id },
      {
        $set: {
          password: hashedPassword,
          full_name: fullName,
          is_admin: true,
          updated_at: now,
        },
      }
    );
    console.log(`Updated existing user ${email} to admin.`);
  } else {
    const user = {
      email,
      password: hashedPassword,
      full_name: fullName,
      phone: null,
      address: null,
      city: null,
      state: null,
      pincode: null,
      is_admin: true,
      created_at: now,
      updated_at: now,
    };

    const result = await db.collection('users').insertOne(user);
    console.log(`Created admin user ${email} with id ${result.insertedId}`);
  }
}

ensureAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Admin seed failed:', err);
    process.exit(1);
  });

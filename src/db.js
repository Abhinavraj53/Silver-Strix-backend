import 'dotenv/config';
import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB_NAME || 'silverstrix';

let client;
let db;

export async function connectDB() {
  if (db) return db;
  const mongoOptions = {
    serverSelectionTimeoutMS: 10000,
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    tls: true,
  };

  if (process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === 'true') {
    mongoOptions.tlsAllowInvalidCertificates = true;
  }

  client = new MongoClient(uri, mongoOptions);
  await client.connect();
  db = client.db(dbName);
  await createIndexes(db);
  return db;
}

async function createIndexes(db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('products').createIndex({ slug: 1 }, { unique: true });
  await db.collection('products').createIndex({ is_active: 1 });
  await db.collection('categories').createIndex({ slug: 1 }, { unique: true });
  await db.collection('cart_items').createIndex({ user_id: 1 });
  await db.collection('orders').createIndex({ user_id: 1 });
  await db.collection('orders').createIndex({ created_at: -1 });
}

export function getDB() {
  if (!db) throw new Error('Database not connected');
  return db;
}

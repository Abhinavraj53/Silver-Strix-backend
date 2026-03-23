/* One-off script to add seven perfume products using the local assets.
 * - Creates a "Perfumes" category if it doesn't exist.
 * - Uploads images to Cloudinary.
 * - Inserts products with basic pricing/stock.
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const slugify = require('slugify');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Product = require('../models/Product');
const Category = require('../models/Category');

const ASSET_DIR = path.join(__dirname, '..', '..', 'src', 'assets', 'Bg Removed');

const products = [
  { name: 'Amber', file: 'Amber Silver Strix.png', description: 'Warm amber attar with soft spice, crafted for all-day wear.' },
  { name: 'Aqua', file: 'Aqua Silver Strix.png', description: 'Fresh aquatic fragrance with crisp citrus top notes.' },
  { name: 'Calm', file: 'Calm Silver Strix.png', description: 'Soothing floral blend designed for relaxation and balance.' },
  { name: 'Fresh', file: 'Fresh Silver Strix.png', description: 'Clean green fragrance with bright herbal and citrus facets.' },
  { name: 'Ice Blue', file: 'Ice Blue Silver strix.png', description: 'Cool mint and musk profile that stays breezy through the day.' },
  { name: 'Ocean', file: 'Ocean Silver Strix.png', description: 'Marine-inspired notes with salty breeze and driftwood depth.' },
  { name: 'Wild Lavender', file: 'Wild Levender Silver Strix.png', description: 'Wild lavender with hints of cedar and tonka for a modern twist.' },
];

async function main() {
  // Validate assets exist
  if (!fs.existsSync(ASSET_DIR)) {
    throw new Error(`Asset folder not found: ${ASSET_DIR}`);
  }

  // Configure cloudinary from env
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Connect to Mongo
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    dbName: process.env.MONGODB_DB_NAME,
  });
  console.log('Connected to MongoDB');

  // Ensure category exists
  let category = await Category.findOne({ slug: 'perfumes' });
  if (!category) {
    category = await Category.create({
      name: 'Perfumes',
      slug: 'perfumes',
      description: 'Signature Silver Strix perfumes with curated notes.',
      image: '',
      isActive: true,
    });
    console.log('Created category Perfumes');
  } else {
    console.log('Using existing category Perfumes');
  }

  for (const item of products) {
    const slug = slugify(item.name, { lower: true });
    const filePath = path.join(ASSET_DIR, item.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File missing, skipping: ${filePath}`);
      continue;
    }

    // Upload image
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      folder: 'silver-strix/perfumes',
      resource_type: 'image',
    });

    const baseData = {
      name: `${item.name} Perfume`,
      description: item.description,
      price: 899,
      originalPrice: 1099,
      category: category._id,
      images: [uploadResult.secure_url],
      stock: 120,
      featured: false,
      isBestseller: false,
      isActive: true,
    };

    const existing = await Product.findOne({ slug });
    if (existing) {
      await Product.updateOne(
        { _id: existing._id },
        {
          $set: baseData,
          $setOnInsert: { slug },
        }
      );
      console.log(`Updated product: ${item.name}`);
    } else {
      const product = new Product({ ...baseData, slug });
      await product.save();
      console.log(`Added product: ${product.name}`);
    }
  }
}

main()
  .then(() => {
    console.log('Done');
    return mongoose.disconnect();
  })
  .catch(async (err) => {
    console.error('Error:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });

const mongoose = require('mongoose');
const slugify = require('slugify');
require('dotenv').config({ path: '.env' });

const Category = require('../models/Category');
const Product = require('../models/Product');
const Banner = require('../models/Banner');
const PromoBlock = require('../models/PromoBlock');
const SectionVideo = require('../models/SectionVideo');

const MONGODB_URI = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const tlsAllowInvalidCertificates = process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === 'true';

const demoCategories = [
  {
    name: 'Reed Diffusers',
    description: 'Signature home fragrances with fiber reeds and long throw.',
    image: 'https://images.unsplash.com/photo-1506617420156-8e4536971650?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Car Perfumes',
    description: 'Compact vent clips and hanging fresheners for your drive.',
    image: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Scented Candles',
    description: 'Clean-burning soy blends with essential oil notes.',
    image: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80'
  }
];

const demoProducts = [
  {
    name: 'Oudh Serenity Reed Diffuser',
    description: 'Rich oudh notes with amber and musk in a minimalist bottle.',
    price: 1299,
    originalPrice: 1599,
    stock: 120,
    featured: true,
    isBestseller: true,
    images: [
      'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1506617420156-8e4536971650?auto=format&fit=crop&w=900&q=80'
    ],
    categoryName: 'Reed Diffusers'
  },
  {
    name: 'Citrus Drive Car Perfume',
    description: 'Zesty citrus and neroli with anti-odor technology.',
    price: 699,
    originalPrice: 899,
    stock: 200,
    isBestseller: true,
    images: [
      'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1542293787938-4d22197095b8?auto=format&fit=crop&w=900&q=80'
    ],
    categoryName: 'Car Perfumes'
  },
  {
    name: 'Lavender Driftwood Candle',
    description: 'Hand-poured soy candle with lavender, driftwood, and sea salt.',
    price: 899,
    originalPrice: 1099,
    stock: 150,
    featured: true,
    images: [
      'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1504197885-609741792ce7?auto=format&fit=crop&w=900&q=80'
    ],
    categoryName: 'Scented Candles'
  }
];

const demoBanners = [
  {
    title: 'Fragrance that defines every room',
    subtitle: 'Explore the Silver Strix collection of diffusers and candles.',
    image_url: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1600&q=80',
    link_url: '#/categories',
    button_text: 'Shop Categories',
    position: 'hero',
    is_active: true,
    display_order: 0
  },
  {
    title: 'Drive fresh. Drive Silver.',
    subtitle: 'Car perfumes with long-lasting freshness.',
    image_url: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1600&q=80',
    link_url: '#/category/car-perfumes',
    button_text: 'View Car Perfumes',
    position: 'hero',
    is_active: true,
    display_order: 1
  }
];

const demoPromoBlocks = [
  {
    title: 'Need help choosing a scent?',
    description: 'Talk to our fragrance stylist for tailored picks.',
    image_url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=900&q=80',
    button_text: 'Chat Now',
    link_url: 'tel:+919876543210',
    display_order: 0,
    is_active: true
  },
  {
    title: 'Corporate gifting made easy',
    description: 'Custom sleeves, logos, and bulk pricing for teams.',
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
    button_text: 'Enquire',
    link_url: 'mailto:info@silverstrix.com',
    display_order: 1,
    is_active: true
  }
];

const demoVideos = [
  {
    title: 'Inside our pour studio',
    video_url: 'https://res.cloudinary.com/demo/video/upload/w_900,e_loop/v1692883991/sofa.webm',
    display_order: 0,
    is_active: true
  }
];

async function upsertCategories() {
  const results = {};
  for (const cat of demoCategories) {
    const slug = slugify(cat.name, { lower: true });
    const existing = await Category.findOne({ slug });
    if (existing) {
      existing.name = cat.name;
      existing.description = cat.description;
      existing.image = cat.image;
      await existing.save();
      results[cat.name] = existing._id;
    } else {
      const doc = await Category.create({ ...cat, slug });
      results[cat.name] = doc._id;
    }
  }
  return results;
}

async function upsertProducts(categoryMap) {
  for (const prod of demoProducts) {
    const catId = categoryMap[prod.categoryName];
    if (!catId) continue;
    const slug = slugify(prod.name, { lower: true });
    const existing = await Product.findOne({ slug });
    if (existing) {
      Object.assign(existing, {
        description: prod.description,
        price: prod.price,
        originalPrice: prod.originalPrice,
        images: prod.images,
        category: catId,
        stock: prod.stock,
        featured: prod.featured || false,
        isBestseller: prod.isBestseller || false,
        isActive: true,
        slug
      });
      await existing.save();
    } else {
      await Product.create({
        ...prod,
        category: catId,
        slug
      });
    }
  }
}

async function upsertBanners() {
  for (const banner of demoBanners) {
    const existing = await Banner.findOne({ title: banner.title, position: 'hero' });
    if (existing) {
      Object.assign(existing, banner);
      await existing.save();
    } else {
      await Banner.create(banner);
    }
  }
}

async function upsertPromoBlocks() {
  for (const block of demoPromoBlocks) {
    const existing = await PromoBlock.findOne({ title: block.title });
    if (existing) {
      Object.assign(existing, block);
      await existing.save();
    } else {
      await PromoBlock.create(block);
    }
  }
}

async function upsertVideos() {
  for (const video of demoVideos) {
    const existing = await SectionVideo.findOne({ title: video.title });
    if (existing) {
      Object.assign(existing, video);
      await existing.save();
    } else {
      await SectionVideo.create(video);
    }
  }
}

async function run() {
  await mongoose.connect(MONGODB_URI, {
    dbName,
    tlsAllowInvalidCertificates,
  });
  console.log('Connected to DB');

  const categoryMap = await upsertCategories();
  console.log('Categories seeded:', categoryMap);

  await upsertProducts(categoryMap);
  console.log('Products seeded');

  await upsertBanners();
  console.log('Hero banners seeded');

  await upsertPromoBlocks();
  console.log('Promo blocks seeded');

  await upsertVideos();
  console.log('Section videos seeded');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

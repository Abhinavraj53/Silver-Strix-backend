import { connectDB } from './db.js';

const products = [
  {
    name: 'Aqua',
    slug: 'aqua',
    tagline: 'A Splash of Clean Confidence',
    description: 'Fresh and invigorating, Aqua brings the essence of cool mountain springs to your drive. Crafted with premium essential oils sourced from the finest regions, this fragrance delivers a crisp, clean scent that transforms your car into a serene sanctuary. Perfect for those who appreciate the purity of nature combined with sophisticated luxury.',
    price: 599,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227803/silver-strix/site/silver-strix/site/Aqua_Silver_Strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227803/silver-strix/site/silver-strix/site/Aqua_Silver_Strix.png',
    ],
    color: '#2DD4BF',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Fresh Aquatic' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    name: 'Ice Blue',
    slug: 'ice-blue',
    tagline: 'Coolness with a Confident Edge',
    description: 'Bold and refreshing, Ice Blue delivers an arctic freshness that awakens your senses and elevates every journey. This premium fragrance combines icy mint with subtle woody undertones, creating a sophisticated scent profile that speaks to the modern driver.',
    price: 599,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227815/silver-strix/site/silver-strix/site/Ice_Blue_Silver_strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227815/silver-strix/site/silver-strix/site/Ice_Blue_Silver_strix.png',
    ],
    color: '#38BDF8',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Cool Aromatic' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    name: 'Amber',
    slug: 'amber',
    tagline: 'Warmth Meets Sophistication',
    description: 'Rich and captivating, Amber envelops your car interior with warm golden notes of resin, vanilla, and sandalwood. A timeless fragrance that brings an air of refined elegance to every journey.',
    price: 649,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227811/silver-strix/site/silver-strix/site/Amber_Silver_Strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227811/silver-strix/site/silver-strix/site/Amber_Silver_Strix.png',
    ],
    color: '#D4A574',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Warm Oriental' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    name: 'Wild Lavender',
    slug: 'wild-lavender',
    tagline: 'Bold Calm for the Modern Drive',
    description: 'Serene yet sophisticated, Wild Lavender brings the calming fields of Provence to your cabin. This elegant fragrance blends wild lavender with subtle hints of honey and vanilla, creating a soothing atmosphere.',
    price: 649,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227818/silver-strix/site/silver-strix/site/Wild_Levender_Silver_Strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227818/silver-strix/site/silver-strix/site/Wild_Levender_Silver_Strix.png',
    ],
    color: '#A78BFA',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Aromatic Floral' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    name: 'Fresh',
    slug: 'fresh',
    tagline: 'Pure Energy for the Open Road',
    description: 'Crisp and revitalizing, Fresh captures the essence of morning dew on green leaves. This invigorating fragrance combines herbal notes with a clean citrus finish, delivering a burst of natural energy to your drive.',
    price: 599,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227808/silver-strix/site/silver-strix/site/Fresh_Silver_Strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227808/silver-strix/site/silver-strix/site/Fresh_Silver_Strix.png',
    ],
    color: '#22C55E',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Green Herbal' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    name: 'Ocean',
    slug: 'ocean',
    tagline: 'Inspired by the Depths of the Ocean',
    description: 'Deep and mysterious, Ocean captures the essence of the sea with notes of marine accord and driftwood. This luxurious fragrance takes you on a sensory journey to pristine coastal waters.',
    price: 599,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227821/silver-strix/site/silver-strix/site/Ocean_Silver_Strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227821/silver-strix/site/silver-strix/site/Ocean_Silver_Strix.png',
    ],
    color: '#3B82F6',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Marine Aquatic' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    name: 'Calm',
    slug: 'calm',
    tagline: 'Serenity in Every Mile',
    description: 'Gentle and soothing, Calm wraps your car interior in a blanket of peaceful tranquility. Soft notes of chamomile, white tea, and cedarwood create a meditative atmosphere.',
    price: 649,
    compare_price: null,
    image_url: 'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227806/silver-strix/site/silver-strix/site/Calm_Silver_Strix.png',
    gallery_urls: [
      'https://res.cloudinary.com/df3smm2gt/image/upload/v1773227806/silver-strix/site/silver-strix/site/Calm_Silver_Strix.png',
    ],
    color: '#94A3B8',
    stock: 100,
    is_active: true,
    features: ['Long-lasting 60-day formula', 'Premium essential oils', 'Compact 10ml bottle'],
    specifications: { volume: '10ml', weight: '50g', fragrance_family: 'Soft Woody' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const categories = [
  {
    name: 'Car Perfumes',
    slug: 'car-perfumes',
    description: 'Premium car fragrances for the discerning driver',
    image_url: null,
    created_at: new Date().toISOString(),
  },
];

async function seed() {
  try {
    const db = await connectDB();

    const existingProducts = await db.collection('products').countDocuments();
    if (existingProducts > 0) {
      console.log('Database already seeded. Skipping.');
      process.exit(0);
    }

    await db.collection('categories').insertMany(categories);
    console.log('Categories seeded.');

    const cats = await db.collection('categories').find().toArray();
    const catId = cats[0]._id.toString();

    const productsWithCategory = products.map(p => ({ ...p, category_id: catId }));
    await db.collection('products').insertMany(productsWithCategory);
    console.log('Products seeded.');

    console.log('Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();

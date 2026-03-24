const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS Configuration - Must be the first middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allowed origins - includes localhost for development and production URLs
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://pujnam-store.onrender.com',
      'https://pujnam-store-frontend.onrender.com',
      'https://*.onrender.com',
      'https://*.vercel.app',
      'https://*.netlify.app'
    ];
    
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (origin.includes('onrender.com') || origin.includes('vercel.app') || origin.includes('netlify.app')) {
      // Allow any Render, Vercel, or Netlify subdomain
      callback(null, true);
    } else {
      // For development, allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

/**
 * INTELLIGENT HTTP CACHING MIDDLEWARE
 * Reduces bandwidth and improves perceived performance
 * Cache headers are set per endpoint type
 */
app.use((req, res, next) => {
  // Cache GET requests for read-only endpoints
  if (req.method === 'GET') {
    // Products, categories, banners - cache for long
    if (req.path.match(/\/(products|categories|banners|settings|videos)\/?$/)) {
      res.setHeader('Cache-Control', 'public, max-age=600'); // 10 minutes
      res.setHeader('ETag', `"v1-${Date.now()}"`);
    }
    // User profile - cache shorter, must revalidate
    else if (req.path.match(/\/auth\/me\/?$/)) {
      res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
      res.setHeader('ETag', `"user-${Date.now()}"`);
    }
    // Other GETs - moderate cache
    else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    }
  } else {
    // POST/PUT/DELETE - never cache
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

const SKIP_DB = process.env.SKIP_DB === 'true';

if (!SKIP_DB) {
  // MongoDB Connection
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pujnamstore_db_user:1LdZi3kdzQbuR70g@cluster0.l1hh67m.mongodb.net/pujnam_store?retryWrites=true&w=majority';

  // MongoDB connection options
  const mongooseOptions = {
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
    connectTimeoutMS: 30000, // 30 seconds
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority',
    tlsAllowInvalidCertificates: process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === 'true',
    dbName: process.env.MONGODB_DB_NAME
  };

  mongoose.connect(MONGODB_URI, mongooseOptions)
    .then(() => {
      console.log('✅ Connected to MongoDB Atlas');
      console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err.message);
      console.error('💡 Make sure:');
      console.error('   1. Your IP is whitelisted in MongoDB Atlas');
      console.error('   2. MongoDB Atlas cluster is running');
      console.error('   3. Network connection is stable');
    });

  // Handle connection events
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
  });
} else {
  console.warn('⚠️  SKIP_DB=true => running backend without MongoDB connection (local dev mode).');
}

// Import Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const bannerRoutes = require('./routes/banners');
const panchangRoutes = require('./routes/panchang');
const couponRoutes = require('./routes/coupons');
const customerRoutes = require('./routes/customers');
const settingsRoutes = require('./routes/settings');
const festivalRoutes = require('./routes/festivals');
const uploadRoutes = require('./routes/upload');
const promoBlockRoutes = require('./routes/promoBlocks');
const sectionVideoRoutes = require('./routes/sectionVideos');
const attributeRoutes = require('./routes/attributes');
const subscriberRoutes = require('./routes/subscribers');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/panchang', panchangRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/festivals', festivalRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/promo-blocks', promoBlockRoutes);
app.use('/api/section-videos', sectionVideoRoutes);
app.use('/api/attributes', attributeRoutes);
app.use('/api/newsletter', subscriberRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIlver Strix API is running' });
});

// Diagnostic endpoint to check email service configuration (for debugging)
app.get('/api/diagnostics/email', (req, res) => {
  const isRender = !!(
    process.env.RENDER || 
    process.env.RENDER_EXTERNAL_URL || 
    process.env.RENDER_SERVICE_NAME
  );
  
  res.json({
    environment: {
      isRender: isRender,
      nodeEnv: process.env.NODE_ENV || 'development',
      hasRenderEnv: !!process.env.RENDER,
      hasRenderUrl: !!process.env.RENDER_EXTERNAL_URL,
      hasRenderService: !!process.env.RENDER_SERVICE_NAME
    },
    emailServices: {
      hostinger: {
        configured: !!(process.env.HOSTINGER_EMAIL_USER && process.env.HOSTINGER_EMAIL_PASSWORD),
        hasUser: !!process.env.HOSTINGER_EMAIL_USER,
        hasPassword: !!process.env.HOSTINGER_EMAIL_PASSWORD,
        port: process.env.HOSTINGER_SMTP_PORT || 'not set'
      },
    },
    recommendedService: 'Hostinger SMTP (Primary)'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

// Render automatically sets PORT environment variable
// We use it directly - no need to set manually
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0'; // Default 0.0.0.0, override with HOST for local dev

// Log environment variables status (without exposing sensitive data)
console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 PORT from Render: ${process.env.PORT || 'Not set (using default 5001)'}`);
console.log(`🌐 Binding to: ${HOST}:${PORT}`);

// Start server only after MongoDB connection is established or after timeout
const startServer = () => {
  app.listen(PORT, HOST, () => {
    console.log(`✅ Server successfully started on http://${HOST}:${PORT}`);
    console.log(`🚀 Backend API is ready at: http://${HOST}:${PORT}/api`);
    console.log(`📡 CORS enabled for production domains`);
    console.log(`\n⚠️  Note: If you see database errors, check:`);
    console.log(`   1. MongoDB Atlas IP whitelist includes 0.0.0.0/0 (all IPs)`);
    console.log(`   2. MongoDB Atlas cluster is running`);
    console.log(`   3. MONGODB_URI environment variable is set correctly\n`);
  });
};

if (SKIP_DB) {
  startServer();
} else {
  // Wait for MongoDB connection or start server anyway after 5 seconds
  const connectionTimeout = setTimeout(() => {
    if (mongoose.connection.readyState === 0) {
      console.warn('⚠️  Starting server without MongoDB connection. Some features may not work.');
      startServer();
    }
  }, 5000);

  mongoose.connection.once('connected', () => {
    clearTimeout(connectionTimeout);
    startServer();
  });

  // If already connected, start immediately
  if (mongoose.connection.readyState === 1) {
    clearTimeout(connectionTimeout);
    startServer();
  }
}

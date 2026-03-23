const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validate Cloudinary credentials early to avoid silent 500s during upload
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in the backend .env');
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    // allow slight headroom above 5MB to avoid boundary rounding rejections
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// Multer for video uploads (larger limit)
const videoUpload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for video
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  },
});

// Upload single image
router.post('/image', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Convert buffer to base64
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'pujnam-store',
      resource_type: 'auto',
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
});

// Upload multiple images
router.post('/images', adminAuth, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const uploadPromises = req.files.map((file) => {
      const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      return cloudinary.uploader.upload(base64Image, {
        folder: 'pujnam-store',
        resource_type: 'auto',
      });
    });

    const results = await Promise.all(uploadPromises);

    res.json({
      urls: results.map((result) => result.secure_url),
      public_ids: results.map((result) => result.public_id),
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload images' });
  }
});

// Upload video (saved to Cloudinary) - uses stream for large files
router.post('/video', adminAuth, videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const stream = Readable.from(req.file.buffer);
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'pujnam-store/videos',
          resource_type: 'video',
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.pipe(uploadStream);
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error('Cloudinary video upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload video' });
  }
});

// Multer / upload error handler so the client gets meaningful errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const friendly = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large. Max 5MB.'
      : err.message;
    return res.status(400).json({ error: friendly });
  }
  if (err && err.message === 'Only image files are allowed!') {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: err?.message || 'Upload failed' });
});

module.exports = router;

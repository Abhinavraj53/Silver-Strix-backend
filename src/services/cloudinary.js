import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  secure: true,
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadImage(image, folder = 'silver-strix') {
  if (!image) {
    throw new Error('Image is required');
  }

  const uploadResponse = await cloudinary.uploader.upload(image, {
    folder,
    resource_type: 'image',
    overwrite: true,
  });

  return {
    url: uploadResponse.secure_url,
    public_id: uploadResponse.public_id,
  };
}

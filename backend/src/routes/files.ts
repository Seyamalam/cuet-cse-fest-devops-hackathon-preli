import express, { Request, Response } from 'express';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  getPresignedUrl,
  listObjects,
  isMinioAvailable,
} from '../config/minio';

// =============================================================================
// File Storage API Routes
// =============================================================================
// S3-Compatible Object Storage using MinIO
// =============================================================================

const router = express.Router();
const BUCKET = process.env.MINIO_BUCKET || 'ecommerce';

/**
 * Check if MinIO is available
 */
router.get('/status', (_req: Request, res: Response) => {
  const available = isMinioAvailable();
  res.status(available ? 200 : 503).json({
    available,
    bucket: BUCKET,
    message: available ? 'MinIO storage is ready' : 'MinIO storage is not configured',
  });
});

/**
 * List all files in a bucket
 * GET /api/files?prefix=images/
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const prefix = req.query.prefix as string | undefined;
    const files = await listObjects(BUCKET, prefix);
    
    return res.json({
      bucket: BUCKET,
      prefix: prefix || '',
      count: files.length,
      files,
    });
  } catch (err) {
    console.error('GET /api/files error:', err);
    return res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * Upload a file (JSON with base64 content)
 * POST /api/files
 * Body: { filename: string, content: string (base64), contentType?: string }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const { filename, content, contentType } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Invalid content - must be base64 encoded' });
    }

    // Decode base64 content
    const buffer = Buffer.from(content, 'base64');
    
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const objectName = `uploads/${timestamp}-${filename}`;

    const metadata: Record<string, string> = {
      'original-name': filename,
      'upload-time': new Date().toISOString(),
    };

    if (contentType) {
      metadata['content-type'] = contentType;
    }

    const url = await uploadFile(BUCKET, objectName, buffer, metadata);

    if (!url) {
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    // Generate a presigned URL for accessing the file
    const downloadUrl = await getPresignedUrl(BUCKET, objectName, 3600);

    return res.status(201).json({
      success: true,
      objectName,
      bucket: BUCKET,
      size: buffer.length,
      downloadUrl,
      message: 'File uploaded successfully',
    });
  } catch (err) {
    console.error('POST /api/files error:', err);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * Get file info and download URL
 * GET /api/files/:objectName
 */
router.get('/:objectName(*)', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const { objectName } = req.params;

    if (!objectName) {
      return res.status(400).json({ error: 'Object name required' });
    }

    // Generate presigned URL (valid for 1 hour)
    const downloadUrl = await getPresignedUrl(BUCKET, objectName, 3600);

    if (!downloadUrl) {
      return res.status(404).json({ error: 'File not found or unable to generate URL' });
    }

    return res.json({
      objectName,
      bucket: BUCKET,
      downloadUrl,
      expiresIn: '1 hour',
    });
  } catch (err) {
    console.error('GET /api/files/:objectName error:', err);
    return res.status(500).json({ error: 'Failed to get file' });
  }
});

/**
 * Download file content
 * GET /api/files/:objectName/download
 */
router.get('/:objectName(*)/download', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const { objectName } = req.params;

    if (!objectName) {
      return res.status(400).json({ error: 'Object name required' });
    }

    const fileContent = await downloadFile(BUCKET, objectName);

    if (!fileContent) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set content disposition for download
    const filename = objectName.split('/').pop() || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileContent.length);
    
    return res.send(fileContent);
  } catch (err) {
    console.error('GET /api/files/:objectName/download error:', err);
    return res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * Delete a file
 * DELETE /api/files/:objectName
 */
router.delete('/:objectName(*)', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const { objectName } = req.params;

    if (!objectName) {
      return res.status(400).json({ error: 'Object name required' });
    }

    const success = await deleteFile(BUCKET, objectName);

    if (!success) {
      return res.status(500).json({ error: 'Failed to delete file' });
    }

    return res.json({
      success: true,
      objectName,
      message: 'File deleted successfully',
    });
  } catch (err) {
    console.error('DELETE /api/files/:objectName error:', err);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * Upload product image
 * POST /api/files/products/:productId/image
 */
router.post('/products/:productId/image', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const { productId } = req.params;
    const { content, contentType } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Invalid content - must be base64 encoded' });
    }

    // Decode base64 content
    const buffer = Buffer.from(content, 'base64');
    
    // Generate product image path
    const timestamp = Date.now();
    const objectName = `products/${productId}/image-${timestamp}.jpg`;

    const metadata: Record<string, string> = {
      'product-id': productId,
      'upload-time': new Date().toISOString(),
      'content-type': contentType || 'image/jpeg',
    };

    const url = await uploadFile(BUCKET, objectName, buffer, metadata);

    if (!url) {
      return res.status(500).json({ error: 'Failed to upload product image' });
    }

    // Generate a presigned URL for accessing the image
    const imageUrl = await getPresignedUrl(BUCKET, objectName, 86400); // 24 hours

    return res.status(201).json({
      success: true,
      productId,
      objectName,
      imageUrl,
      size: buffer.length,
      message: 'Product image uploaded successfully',
    });
  } catch (err) {
    console.error('POST /api/files/products/:productId/image error:', err);
    return res.status(500).json({ error: 'Failed to upload product image' });
  }
});

/**
 * List product images
 * GET /api/files/products/:productId/images
 */
router.get('/products/:productId/images', async (req: Request, res: Response) => {
  try {
    if (!isMinioAvailable()) {
      return res.status(503).json({ error: 'Storage service unavailable' });
    }

    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    const prefix = `products/${productId}/`;
    const images = await listObjects(BUCKET, prefix);

    // Generate presigned URLs for all images
    const imagesWithUrls = await Promise.all(
      images.map(async (objectName) => ({
        objectName,
        url: await getPresignedUrl(BUCKET, objectName, 3600),
      }))
    );

    return res.json({
      productId,
      count: images.length,
      images: imagesWithUrls,
    });
  } catch (err) {
    console.error('GET /api/files/products/:productId/images error:', err);
    return res.status(500).json({ error: 'Failed to list product images' });
  }
});

export default router;

import { Client } from 'minio';

// =============================================================================
// MinIO S3-Compatible Storage Configuration
// =============================================================================
// Critical Infrastructure Object Storage
// =============================================================================

const minioConfig = {
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
};

let minioClient: Client | null = null;

/**
 * Initialize MinIO client
 */
export const initMinIO = async (): Promise<Client | null> => {
  if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
    console.warn('⚠️  MinIO credentials not configured - object storage disabled');
    return null;
  }

  try {
    minioClient = new Client(minioConfig);

    // Test connection by listing buckets
    const buckets = await minioClient.listBuckets();
    console.log(`✅ MinIO connected - ${buckets.length} bucket(s) available`);

    // Ensure default bucket exists
    const defaultBucket = process.env.MINIO_BUCKET || 'ecommerce';
    const bucketExists = await minioClient.bucketExists(defaultBucket);
    
    if (!bucketExists) {
      await minioClient.makeBucket(defaultBucket);
      console.log(`✅ Created bucket: ${defaultBucket}`);
    }

    return minioClient;
  } catch (error) {
    console.error('❌ Failed to connect to MinIO:', error);
    return null;
  }
};

/**
 * Upload file to MinIO
 */
export const uploadFile = async (
  bucket: string,
  objectName: string,
  data: Buffer | string,
  metadata?: Record<string, string>
): Promise<string | null> => {
  if (!minioClient) {
    console.warn('MinIO client not initialized');
    return null;
  }

  try {
    await minioClient.putObject(bucket, objectName, data, undefined, metadata);
    console.log(`✅ Uploaded: ${bucket}/${objectName}`);
    return `${minioConfig.endPoint}:${minioConfig.port}/${bucket}/${objectName}`;
  } catch (error) {
    console.error('❌ Failed to upload to MinIO:', error);
    return null;
  }
};

/**
 * Download file from MinIO
 */
export const downloadFile = async (
  bucket: string,
  objectName: string
): Promise<Buffer | null> => {
  if (!minioClient) {
    console.warn('MinIO client not initialized');
    return null;
  }

  try {
    const stream = await minioClient.getObject(bucket, objectName);
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  } catch (error) {
    console.error('❌ Failed to download from MinIO:', error);
    return null;
  }
};

/**
 * Delete file from MinIO
 */
export const deleteFile = async (
  bucket: string,
  objectName: string
): Promise<boolean> => {
  if (!minioClient) {
    console.warn('MinIO client not initialized');
    return false;
  }

  try {
    await minioClient.removeObject(bucket, objectName);
    console.log(`✅ Deleted: ${bucket}/${objectName}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete from MinIO:', error);
    return false;
  }
};

/**
 * Generate presigned URL for file access
 */
export const getPresignedUrl = async (
  bucket: string,
  objectName: string,
  expirySeconds: number = 3600
): Promise<string | null> => {
  if (!minioClient) {
    console.warn('MinIO client not initialized');
    return null;
  }

  try {
    const url = await minioClient.presignedGetObject(bucket, objectName, expirySeconds);
    return url;
  } catch (error) {
    console.error('❌ Failed to generate presigned URL:', error);
    return null;
  }
};

/**
 * List objects in a bucket
 */
export const listObjects = async (
  bucket: string,
  prefix?: string
): Promise<string[]> => {
  if (!minioClient) {
    console.warn('MinIO client not initialized');
    return [];
  }

  try {
    const objects: string[] = [];
    const stream = minioClient.listObjects(bucket, prefix, true);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name) objects.push(obj.name);
      });
      stream.on('end', () => resolve(objects));
      stream.on('error', reject);
    });
  } catch (error) {
    console.error('❌ Failed to list objects in MinIO:', error);
    return [];
  }
};

/**
 * Get MinIO client
 */
export const getMinioClient = (): Client | null => minioClient;

/**
 * Check if MinIO is available
 */
export const isMinioAvailable = (): boolean => minioClient !== null;

// S3 helper (AWS SDK v3). Used by M28 creative cards for music stems + acting
// audio uploads. Art cards store a PNG data URL in the DB (no upload needed).

import {
  PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

function shouldServeInline(contentType: string): boolean {
  // image/svg+xml excluded — SVGs can execute embedded scripts (XSS risk)
  return (contentType.startsWith('image/') && contentType !== 'image/svg+xml')
    || contentType.startsWith('video/')
    || contentType.startsWith('audio/');
}

export async function generatePresignedUploadUrl(
  fileName: string, contentType: string, isPublic = false,
): Promise<{ uploadUrl: string; cloud_storage_path: string }> {
  const { bucketName, folderPrefix } = getBucketConfig();
  const cloud_storage_path = isPublic
    ? `${folderPrefix}public/uploads/${Date.now()}-${fileName}`
    : `${folderPrefix}uploads/${Date.now()}-${fileName}`;
  const client = createS3Client();
  const cmd = new PutObjectCommand({ Bucket: bucketName, Key: cloud_storage_path, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

export async function getFileUrl(
  cloud_storage_path: string, contentType: string, isPublic: boolean,
): Promise<string> {
  const { bucketName } = getBucketConfig();
  const region = process.env.AWS_REGION ?? '';
  if (isPublic) {
    const encoded = cloud_storage_path.split('/').map(encodeURIComponent).join('/');
    return `https://${bucketName}.s3.${region}.amazonaws.com/${encoded}`;
  }
  const client = createS3Client();
  const cmd = new GetObjectCommand({
    Bucket: bucketName, Key: cloud_storage_path,
    ResponseContentDisposition: shouldServeInline(contentType) ? 'inline' : 'attachment',
  });
  return getSignedUrl(client, cmd, { expiresIn: 3600 });
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  const { bucketName } = getBucketConfig();
  const client = createS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: cloud_storage_path }));
}

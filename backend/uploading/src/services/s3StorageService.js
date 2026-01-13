import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSettings } from '../config/config.js';
import { env } from '../config/env.js';
import path from 'path';

const s3 = new S3Client({ 
  region: getSettings().region, 
  accessKeyId: getSettings().id, 
  secretAccessKey: getSettings().key 
});

export async function saveS3(file, fileLocation) {
  const bucket = env.AWS_BUCKET_NAME;
  const key = path.join(fileLocation, file.originalname);

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));

  return {
    storageType: 'S3',
    storageName: key,
    storagePath: bucket
  };
}

export async function deleteS3(meta) {
  await s3.send(new DeleteObjectCommand({
    Bucket: meta.STORAGE_PATH,
    Key: meta.STORAGE_NAME
  }));
}

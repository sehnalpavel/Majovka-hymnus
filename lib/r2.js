// lib/r2.js - Cloudflare R2 upload (S3-kompatibilní API)
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL
} = process.env;

let client = null;
function getClient(){
  if (!client){
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET){
      throw new Error('R2 není nakonfigurované — zkontroluj .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).');
    }
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
  }
  return client;
}

/**
 * Upload buffer to R2.
 * @param {string} key - object key (např. "hymns/bourlivaci-x7k3.mp3")
 * @param {Buffer} body - data
 * @param {string} contentType - MIME type
 * @returns {Promise<{key: string, publicUrl: string}>}
 */
export async function uploadToR2(key, body, contentType){
  if (!R2_PUBLIC_URL){
    throw new Error('R2_PUBLIC_URL chybí — povol veřejný přístup nad bucketem a vlož URL do .env.');
  }
  const c = getClient();
  await c.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
  return { key, publicUrl };
}

export function isR2Configured(){
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL);
}

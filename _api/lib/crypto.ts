import crypto from 'crypto';
import { env } from './env.js';

const ivLength = 16;

export function encryptSensitiveValue(value: string) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(env.encryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSensitiveValue(payload: string) {
  const [ivBase64, tagBase64, encryptedBase64] = payload.split('.');

  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error('Valor criptografado inválido.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(env.encryptionKey),
    Buffer.from(ivBase64, 'base64'),
  );

  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

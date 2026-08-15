import crypto from 'crypto';

export interface ApiKeyData {
  prefix: string;
  rawKey: string;
  keyHash: string;
}

export function generateApiKey(name: string): ApiKeyData {
  const rawKey = `cmc_${crypto.randomBytes(32).toString('hex')}`;
  const prefix = rawKey.substring(0, 12);
  const keyHash = hashApiKey(rawKey);

  return { prefix, rawKey, keyHash };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
}
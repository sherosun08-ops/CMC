import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  uri: string;
}

export function generateTwoFactorSecret(email: string, issuer = 'CMC'): TwoFactorSetup {
  const secret = speakeasy.generateSecret({
    name: `${issuer}:${email}`,
    issuer,
  });

  return {
    secret: secret.base32,
    qrCode: '', // generated below
    uri: secret.otpauth_url || '',
  };
}

export async function generateQRCode(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl);
}

export function verifyTwoFactorToken(token: string, secret: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1, // allow 1 step drift (30s)
  });
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}
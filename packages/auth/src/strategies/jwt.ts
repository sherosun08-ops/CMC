import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-min-32-chars!!';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret-min-32-chars!';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  roleIds: string[];
  isSuperAdmin: boolean;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload as Record<string, unknown>, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY } as SignOptions);
}

export function generateRefreshToken(payload: Pick<JwtPayload, 'sub'>): string {
  return jwt.sign({ sub: payload.sub }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY } as SignOptions);
}

export function generateTokenPair(payload: JwtPayload): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: 900, // 15 minutes in seconds
  };
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string };
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
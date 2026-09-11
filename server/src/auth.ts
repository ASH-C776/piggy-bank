import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const secret = new TextEncoder().encode(config.jwtSecret);

export interface JwtPayload {
  sub: number;          // user id
  role: 'parent' | 'child';
  name: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return await new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(config.jwtExpiresIn)
    .setSubject(String(payload.sub))
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: Number(payload.sub),
      role: payload.role as 'parent' | 'child',
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

// 校验PIN：4-6位数字
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

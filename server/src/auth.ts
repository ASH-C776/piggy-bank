import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const secret = new TextEncoder().encode(config.jwtSecret);

export interface JwtPayload {
  sub: number;          // user id
  role: 'parent' | 'child';
  name: string;
  tv: number;           // token_version：改密/改 PIN 后递增，旧令牌立即失效
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 同步版本，供启动迁移与一次性写入使用；与 hashPassword 同一算法 */
export function hashPasswordSync(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export async function signToken(payload: { sub: number; role: 'parent' | 'child'; name: string; tv: number }): Promise<string> {
  return await new SignJWT({ role: payload.role, name: payload.name, tv: payload.tv })
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
      tv: Number(payload.tv ?? 0),
    };
  } catch {
    return null;
  }
}

// 校验PIN：4-6位数字
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

// 判断字符串是否为尚未哈希的明文 PIN（bcrypt 哈希以 $2 开头）
export function isPlaintextPin(pin: string | null | undefined): boolean {
  return !!pin && /^\d{4,6}$/.test(pin) && !pin.startsWith('$2');
}

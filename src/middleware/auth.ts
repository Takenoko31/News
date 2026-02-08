/**
 * 管理者認証ミドルウェア
 *
 * JWT を HttpOnly Cookie または Authorization ヘッダーから取得し検証する。
 */
import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { verifyJwt, type JwtPayload } from '../lib/jwt';

/** 管理者認証必須ミドルウェア */
export async function requireAdmin(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const payload = await extractJwt(c);

  if (!payload || payload.role !== 'admin') {
    return c.json({ error: { code: 'UNAUTHORIZED', message: '管理者認証が必要です' } }, 401);
  }

  // ペイロードを context に保存
  c.set('adminPayload' as never, payload as never);
  await next();
}

async function extractJwt(c: Context<{ Bindings: Env }>): Promise<JwtPayload | null> {
  // 1. Authorization: Bearer <token>
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyJwt(token, c.env.JWT_SECRET);
  }

  // 2. HttpOnly Cookie
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
    if (match) {
      return verifyJwt(match[1], c.env.JWT_SECRET);
    }
  }

  return null;
}

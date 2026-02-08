/**
 * Cloudflare Turnstile サーバサイド検証ミドルウェア
 */
import type { Context } from 'hono';
import type { Env } from '../types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string | null,
): Promise<boolean> {
  const body = new URLSearchParams({
    secret,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });

  const res = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = (await res.json()) as { success: boolean };
  return json.success === true;
}

/** Hono ミドルウェアとして使うヘルパー */
export async function requireTurnstile(
  c: Context<{ Bindings: Env }>,
  token: string,
): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
  return verifyTurnstile(token, c.env.TURNSTILE_SECRET, ip);
}

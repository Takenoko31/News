import { Hono } from 'hono';
import type { Env } from '../types';
import { postVoteSchema } from '../lib/validation';
import { fingerprintFromRequest } from '../lib/fingerprint';
import { requireTurnstile } from '../middleware/turnstile';
import { checkRateLimit } from '../middleware/rate-limit';
import { VOTE_COOLDOWN_MS } from '../lib/ranking';

const votes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/votes
 */
votes.post('/votes', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'リクエストボディが不正です' } }, 400);
  }

  const parsed = postVoteSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(', ');
    return c.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400);
  }

  const { item_id, value, turnstile_token } = parsed.data;

  // Turnstile 検証
  const turnstileOk = await requireTurnstile(c, turnstile_token);
  if (!turnstileOk) {
    return c.json({ error: { code: 'TURNSTILE_FAILED', message: 'bot検証に失敗しました' } }, 403);
  }

  // フィンガープリント
  const fp = await fingerprintFromRequest(c.env.FINGERPRINT_SECRET, c.req.raw);

  // BAN チェック
  const ban = await c.env.DB.prepare('SELECT banned_until FROM bans WHERE fingerprint_hash = ?')
    .bind(fp)
    .first<{ banned_until: number }>();
  if (ban && ban.banned_until > Date.now()) {
    return c.json({ error: { code: 'BANNED', message: '現在投票が制限されています' } }, 403);
  }

  // 全体レート制限（1分10投票）
  const rl = checkRateLimit(`vote:${fp}`, 10, 60_000);
  if (!rl.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: '投票頻度が高すぎます。しばらく待ってください' } }, 429);
  }

  // 投稿存在チェック
  const item = await c.env.DB.prepare('SELECT id, is_deleted, is_hidden FROM items WHERE id = ?')
    .bind(item_id)
    .first<{ id: string; is_deleted: number; is_hidden: number }>();

  if (!item || item.is_deleted === 1) {
    return c.json({ error: { code: 'NOT_FOUND', message: '投稿が見つかりません' } }, 404);
  }

  if (item.is_hidden === 1) {
    return c.json({ error: { code: 'HIDDEN', message: 'この投稿は現在非表示です' } }, 403);
  }

  // 重複投票チェック（同一ユーザー + 同一投稿 + 24時間以内）
  const now = Date.now();
  const cooldownStart = now - VOTE_COOLDOWN_MS;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM votes WHERE item_id = ? AND fingerprint_hash = ? AND created_at > ?',
  )
    .bind(item_id, fp, cooldownStart)
    .first();

  if (existing) {
    return c.json({ error: { code: 'ALREADY_VOTED', message: 'この投稿には24時間以内に投票済みです' } }, 409);
  }

  // 投票を挿入
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO votes (id, item_id, value, created_at, fingerprint_hash) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, item_id, value, now, fp)
    .run();

  return c.json({ ok: true, vote_id: id }, 201);
});

export { votes };

import { Hono } from 'hono';
import type { Env } from '../types';
import { postItemSchema, validateItemText } from '../lib/validation';
import { fingerprintFromRequest } from '../lib/fingerprint';
import { requireTurnstile } from '../middleware/turnstile';
import { checkRateLimit } from '../middleware/rate-limit';
import { RANKING_QUERY, NEW_ITEMS_QUERY } from '../lib/ranking';

const items = new Hono<{ Bindings: Env }>();

/**
 * GET /api/items?sort=ranking|new&limit=50&offset=0
 */
items.get('/items', async (c) => {
  const sort = c.req.query('sort') === 'new' ? 'new' : 'ranking';
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);
  const now = Date.now();

  const query = sort === 'new' ? NEW_ITEMS_QUERY : RANKING_QUERY;

  const result = await c.env.DB.prepare(query)
    .bind(now, now, now, now, limit, offset)
    .all();

  const data = (result.results || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    text: row.text,
    created_at: row.created_at,
    score: Math.round((row.score as number) * 100) / 100,
    pos_count: row.pos_count,
    neg_count: row.neg_count,
  }));

  return c.json({ items: data, sort, limit, offset });
});

/**
 * POST /api/items
 */
items.post('/items', async (c) => {
  // パース & Zodバリデーション
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'リクエストボディが不正です' } }, 400);
  }

  const parsed = postItemSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(', ');
    return c.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400);
  }

  const { text, turnstile_token } = parsed.data;

  // Turnstile 検証
  const turnstileOk = await requireTurnstile(c, turnstile_token);
  if (!turnstileOk) {
    return c.json({ error: { code: 'TURNSTILE_FAILED', message: 'bot検証に失敗しました' } }, 403);
  }

  // フィンガープリント & BAN チェック
  const fp = await fingerprintFromRequest(c.env.FINGERPRINT_SECRET, c.req.raw);

  const ban = await c.env.DB.prepare('SELECT banned_until FROM bans WHERE fingerprint_hash = ?')
    .bind(fp)
    .first<{ banned_until: number }>();
  if (ban && ban.banned_until > Date.now()) {
    return c.json({ error: { code: 'BANNED', message: '現在投稿が制限されています' } }, 403);
  }

  // レート制限（1分3回）
  const rl = checkRateLimit(`post:${fp}`, 3, 60_000);
  if (!rl.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: '投稿頻度が高すぎます。しばらく待ってください' } }, 429);
  }

  // テキストバリデーション（正規化 + NG判定）
  const validation = validateItemText(text);
  if (!validation.ok) {
    return c.json({ error: { code: validation.errorCode!, message: validation.errorMessage! } }, 400);
  }

  // DB 挿入
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO items (id, text, text_norm, created_at, is_deleted, is_hidden) VALUES (?, ?, ?, ?, 0, 0)',
  )
    .bind(id, validation.normalized, validation.normalized, now)
    .run();

  return c.json({ id, text: validation.normalized, created_at: now }, 201);
});

export { items };

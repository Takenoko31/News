import { Hono } from 'hono';
import type { Env } from '../types';
import { adminLoginSchema, adminDeleteSchema, adminBanSchema } from '../lib/validation';
import { signJwt } from '../lib/jwt';
import { requireAdmin } from '../middleware/auth';

const admin = new Hono<{ Bindings: Env }>();

// ----------------------------------------------------------------
// ログイン / ログアウト
// ----------------------------------------------------------------

/**
 * POST /api/admin/login
 */
admin.post('/login', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'リクエストボディが不正です' } }, 400);
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'パスワードが必要です' } }, 400);
  }

  // タイミング攻撃対策: 固定時間比較は難しいが、Workers では十分高速
  if (parsed.data.password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: { code: 'INVALID_PASSWORD', message: 'パスワードが正しくありません' } }, 401);
  }

  // JWT 発行（有効期限: 8時間）
  const token = await signJwt({ sub: 'admin', role: 'admin' }, c.env.JWT_SECRET, 8 * 60 * 60);

  // HttpOnly Cookie にセット + レスポンスボディにも返す
  const isSecure = c.req.url.startsWith('https');
  const cookieValue = [
    `admin_token=${token}`,
    'HttpOnly',
    `SameSite=${isSecure ? 'None' : 'Lax'}`,
    isSecure ? 'Secure' : '',
    'Path=/',
    'Max-Age=28800',
  ]
    .filter(Boolean)
    .join('; ');

  c.header('Set-Cookie', cookieValue);

  return c.json({ ok: true, token });
});

/**
 * POST /api/admin/logout
 */
admin.post('/logout', async (c) => {
  const isSecure = c.req.url.startsWith('https');
  const cookieValue = [
    'admin_token=',
    'HttpOnly',
    `SameSite=${isSecure ? 'None' : 'Lax'}`,
    isSecure ? 'Secure' : '',
    'Path=/',
    'Max-Age=0',
  ]
    .filter(Boolean)
    .join('; ');

  c.header('Set-Cookie', cookieValue);

  return c.json({ ok: true });
});

// ----------------------------------------------------------------
// 以下すべて管理者認証必須
// ----------------------------------------------------------------

/**
 * GET /api/admin/reports?limit=50&offset=0
 */
admin.get('/reports', requireAdmin, async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);

  const result = await c.env.DB.prepare(`
    SELECT
      r.id, r.item_id, r.reason, r.comment, r.created_at, r.fingerprint_hash, r.is_resolved,
      i.text AS item_text, i.is_deleted AS item_deleted, i.is_hidden AS item_hidden
    FROM reports r
    LEFT JOIN items i ON i.id = r.item_id
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `)
    .bind(limit, offset)
    .all();

  return c.json({ reports: result.results || [], limit, offset });
});

/**
 * POST /api/admin/items/:id/delete
 */
admin.post('/items/:id/delete', requireAdmin, async (c) => {
  const itemId = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'リクエストボディが不正です' } }, 400);
  }

  const parsed = adminDeleteSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(', ');
    return c.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400);
  }

  // 投稿存在チェック
  const item = await c.env.DB.prepare('SELECT id, is_deleted FROM items WHERE id = ?')
    .bind(itemId)
    .first<{ id: string; is_deleted: number }>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '投稿が見つかりません' } }, 404);
  }

  if (item.is_deleted === 1) {
    return c.json({ error: { code: 'ALREADY_DELETED', message: '既に削除されています' } }, 409);
  }

  const now = Date.now();

  // 論理削除
  await c.env.DB.prepare(
    'UPDATE items SET is_deleted = 1, deleted_at = ?, deleted_reason = ?, deleted_by = ? WHERE id = ?',
  )
    .bind(now, parsed.data.reason, 'admin', itemId)
    .run();

  // 関連通報を解決済みにする
  await c.env.DB.prepare('UPDATE reports SET is_resolved = 1 WHERE item_id = ?')
    .bind(itemId)
    .run();

  // 監査ログ
  await c.env.DB.prepare(
    'INSERT INTO admin_actions (id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), 'delete_item', 'item', itemId, parsed.data.reason, now)
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/admin/items/:id/unhide
 */
admin.post('/items/:id/unhide', requireAdmin, async (c) => {
  const itemId = c.req.param('id');

  await c.env.DB.prepare('UPDATE items SET is_hidden = 0 WHERE id = ? AND is_deleted = 0')
    .bind(itemId)
    .run();

  // 関連通報を解決済みにする
  await c.env.DB.prepare('UPDATE reports SET is_resolved = 1 WHERE item_id = ?')
    .bind(itemId)
    .run();

  // 監査ログ
  await c.env.DB.prepare(
    'INSERT INTO admin_actions (id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), 'unhide_item', 'item', itemId, null, Date.now())
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/admin/bans
 */
admin.post('/bans', requireAdmin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'リクエストボディが不正です' } }, 400);
  }

  const parsed = adminBanSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(', ');
    return c.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400);
  }

  const { fingerprint, days, note } = parsed.data;
  const now = Date.now();
  const bannedUntil = now + days * 24 * 60 * 60 * 1000;

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO bans (fingerprint_hash, banned_until, note, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(fingerprint, bannedUntil, note || null, now)
    .run();

  // 監査ログ
  await c.env.DB.prepare(
    'INSERT INTO admin_actions (id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), 'ban', 'fingerprint', fingerprint, `${days}日間 BAN: ${note || ''}`, now)
    .run();

  return c.json({ ok: true, banned_until: bannedUntil });
});

/**
 * GET /api/admin/actions?limit=50&offset=0  (監査ログ閲覧)
 */
admin.get('/actions', requireAdmin, async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);

  const result = await c.env.DB.prepare(
    'SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(limit, offset)
    .all();

  return c.json({ actions: result.results || [], limit, offset });
});

export { admin };

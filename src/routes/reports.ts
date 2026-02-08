import { Hono } from 'hono';
import type { Env } from '../types';
import { postReportSchema, sanitizeComment } from '../lib/validation';
import { fingerprintFromRequest } from '../lib/fingerprint';
import { requireTurnstile } from '../middleware/turnstile';
import { checkRateLimit } from '../middleware/rate-limit';
import { AUTO_HIDE_REPORT_THRESHOLD } from '../lib/ranking';

const reports = new Hono<{ Bindings: Env }>();

/**
 * POST /api/reports
 */
reports.post('/reports', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'リクエストボディが不正です' } }, 400);
  }

  const parsed = postReportSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(', ');
    return c.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400);
  }

  const { item_id, reason, comment, turnstile_token } = parsed.data;

  // Turnstile
  const turnstileOk = await requireTurnstile(c, turnstile_token);
  if (!turnstileOk) {
    return c.json({ error: { code: 'TURNSTILE_FAILED', message: 'bot検証に失敗しました' } }, 403);
  }

  // フィンガープリント
  const fp = await fingerprintFromRequest(c.env.FINGERPRINT_SECRET, c.req.raw);

  // レート制限（1分5通報）
  const rl = checkRateLimit(`report:${fp}`, 5, 60_000);
  if (!rl.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: '通報頻度が高すぎます' } }, 429);
  }

  // 投稿存在チェック
  const item = await c.env.DB.prepare('SELECT id, is_deleted FROM items WHERE id = ?')
    .bind(item_id)
    .first<{ id: string; is_deleted: number }>();

  if (!item || item.is_deleted === 1) {
    return c.json({ error: { code: 'NOT_FOUND', message: '投稿が見つかりません' } }, 404);
  }

  // 同一ユーザーの同一投稿への重複通報チェック
  const existing = await c.env.DB.prepare(
    'SELECT id FROM reports WHERE item_id = ? AND fingerprint_hash = ?',
  )
    .bind(item_id, fp)
    .first();

  if (existing) {
    return c.json({ error: { code: 'ALREADY_REPORTED', message: 'この投稿は既に通報済みです' } }, 409);
  }

  // コメントサニタイズ
  const safeComment = comment ? sanitizeComment(comment) : null;

  // 通報を挿入
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO reports (id, item_id, reason, comment, created_at, fingerprint_hash, is_resolved) VALUES (?, ?, ?, ?, ?, ?, 0)',
  )
    .bind(id, item_id, reason, safeComment, now, fp)
    .run();

  // 自動非表示チェック（通報数がしきい値以上なら非表示にする）
  const reportCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM reports WHERE item_id = ? AND is_resolved = 0',
  )
    .bind(item_id)
    .first<{ cnt: number }>();

  if (reportCount && reportCount.cnt >= AUTO_HIDE_REPORT_THRESHOLD) {
    await c.env.DB.prepare('UPDATE items SET is_hidden = 1 WHERE id = ? AND is_deleted = 0')
      .bind(item_id)
      .run();
  }

  return c.json({ ok: true, report_id: id }, 201);
});

export { reports };

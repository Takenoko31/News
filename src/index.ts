import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { items } from './routes/items';
import { votes } from './routes/votes';
import { reports } from './routes/reports';
import { admin } from './routes/admin';

const app = new Hono<{ Bindings: Env }>();

// ----------------------------------------------------------------
// CORS（Pages ドメインのみ許可）
// ----------------------------------------------------------------
app.use('/api/*', async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN || '*';
  const middleware = cors({
    origin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  });
  return middleware(c, next);
});

// ----------------------------------------------------------------
// ヘルスチェック
// ----------------------------------------------------------------
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// ----------------------------------------------------------------
// 公開 API
// ----------------------------------------------------------------
app.route('/api', items);
app.route('/api', votes);
app.route('/api', reports);

// ----------------------------------------------------------------
// 管理者 API
// ----------------------------------------------------------------
app.route('/api/admin', admin);

// ----------------------------------------------------------------
// 404
// ----------------------------------------------------------------
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'エンドポイントが見つかりません' } }, 404),
);

// ----------------------------------------------------------------
// グローバルエラーハンドラ
// ----------------------------------------------------------------
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'サーバ内部エラー' } }, 500);
});

export default app;

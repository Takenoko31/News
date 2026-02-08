/**
 * シンプルなインメモリ固定ウィンドウ レートリミッター
 *
 * Workers の同一 isolate 内でのみ有効。
 * 完全な分散レート制限が必要な場合は KV / Durable Objects に移行。
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000; // 1分ごとに古いエントリを掃除

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, win] of windows) {
    if (now > win.resetAt) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * レート制限チェック
 * @param key       識別キー（例: "post:" + fingerprint）
 * @param limit     ウィンドウ内の最大リクエスト数
 * @param windowMs  ウィンドウ幅（ミリ秒）
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const win = windows.get(key);

  if (!win || now > win.resetAt) {
    const resetAt = now + windowMs;
    windows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (win.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: win.resetAt };
  }

  win.count++;
  return { allowed: true, remaining: limit - win.count, resetAt: win.resetAt };
}

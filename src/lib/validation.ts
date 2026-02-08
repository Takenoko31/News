import { z } from 'zod';
import { checkNgWords } from './ngwords';

// ----------------------------------------------------------------
// テキスト正規化
// ----------------------------------------------------------------

/** NFKC正規化 + ゼロ幅文字除去 + 空白圧縮 */
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u200E\u200F\uFEFF\u00AD\u034F\u061C\u2060-\u2064\u2066-\u206F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ----------------------------------------------------------------
// 危険パターン検出
// ----------------------------------------------------------------

const URL_PATTERN =
  /https?:\/\/|www\.|[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|net|org|io|co|jp|dev|app|xyz|info|biz|me|tv|cc|ly|to|uk|de|fr|ru|cn|kr|tw)\b/i;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const PHONE_PATTERN =
  /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\+\d{1,3}[-\s]?\d{2,4}[-\s]?\d{2,4}[-\s]?\d{3,4}/;

// ----------------------------------------------------------------
// Zod スキーマ
// ----------------------------------------------------------------

/** 投稿バリデーション */
export const postItemSchema = z.object({
  text: z.string().min(1, '投稿は1文字以上').max(80, '投稿は80文字以内'),
  turnstile_token: z.string().min(1, 'Turnstileトークンが必要です'),
});

/** 投票バリデーション */
export const postVoteSchema = z.object({
  item_id: z.string().uuid('無効なアイテムID'),
  value: z.union([z.literal(1), z.literal(-1)], {
    errorMap: () => ({ message: '投票値は +1 または -1' }),
  }),
  turnstile_token: z.string().min(1, 'Turnstileトークンが必要です'),
});

/** 通報バリデーション */
export const postReportSchema = z.object({
  item_id: z.string().uuid('無効なアイテムID'),
  reason: z.enum(['spam', 'hate', 'sexual', 'personal_info', 'violence', 'other'], {
    errorMap: () => ({ message: '無効な通報理由' }),
  }),
  comment: z.string().max(200, 'コメントは200文字以内').optional(),
  turnstile_token: z.string().min(1, 'Turnstileトークンが必要です'),
});

/** 管理者ログイン */
export const adminLoginSchema = z.object({
  password: z.string().min(1, 'パスワードが必要です'),
});

/** 管理者削除 */
export const adminDeleteSchema = z.object({
  reason: z.string().min(1, '削除理由が必要です').max(200, '200文字以内'),
});

/** BAN */
export const adminBanSchema = z.object({
  fingerprint: z.string().min(1, 'フィンガープリントが必要です'),
  days: z.number().int().min(1).max(365),
  note: z.string().max(200).optional(),
});

// ----------------------------------------------------------------
// テキスト検証（投稿用）
// ----------------------------------------------------------------

export interface TextValidationResult {
  ok: boolean;
  normalized: string;
  errorCode?: string;
  errorMessage?: string;
}

export function validateItemText(raw: string): TextValidationResult {
  const normalized = normalizeText(raw);

  if (normalized.length < 1 || normalized.length > 80) {
    return { ok: false, normalized, errorCode: 'INVALID_LENGTH', errorMessage: '1〜80文字で入力してください' };
  }

  if (URL_PATTERN.test(normalized)) {
    return { ok: false, normalized, errorCode: 'URL_DETECTED', errorMessage: 'URLは投稿できません' };
  }

  if (EMAIL_PATTERN.test(normalized)) {
    return { ok: false, normalized, errorCode: 'EMAIL_DETECTED', errorMessage: 'メールアドレスは投稿できません' };
  }

  if (PHONE_PATTERN.test(normalized)) {
    return { ok: false, normalized, errorCode: 'PHONE_DETECTED', errorMessage: '電話番号は投稿できません' };
  }

  const ngCategory = checkNgWords(normalized);
  if (ngCategory) {
    return { ok: false, normalized, errorCode: 'NG_WORD', errorMessage: '不適切な表現が含まれています' };
  }

  return { ok: true, normalized };
}

/** 通報コメントのサニタイズ */
export function sanitizeComment(raw: string): string {
  return normalizeText(raw).replace(/[<>"'&]/g, '');
}

/** UUID 形式チェック */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

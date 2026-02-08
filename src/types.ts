/** Cloudflare Workers 環境バインディング */
export type Env = {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  FINGERPRINT_SECRET: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  ALLOWED_ORIGIN: string;
};

/** 投稿 */
export interface Item {
  id: string;
  text: string;
  text_norm: string;
  created_at: number;
  is_deleted: number;
  is_hidden: number;
  deleted_at: number | null;
  deleted_reason: string | null;
  deleted_by: string | null;
}

/** 投票 */
export interface Vote {
  id: string;
  item_id: string;
  value: number;
  created_at: number;
  fingerprint_hash: string;
}

/** 通報 */
export interface Report {
  id: string;
  item_id: string;
  reason: string;
  comment: string | null;
  created_at: number;
  fingerprint_hash: string;
  is_resolved: number;
}

/** BAN */
export interface Ban {
  fingerprint_hash: string;
  banned_until: number;
  note: string | null;
  created_at: number;
}

/** API エラーレスポンス */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** ランキング付き投稿 */
export interface RankedItem {
  id: string;
  text: string;
  created_at: number;
  score: number;
  pos_count: number;
  neg_count: number;
}

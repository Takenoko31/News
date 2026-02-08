-- ============================================================
-- Bucket List Voting App - D1 Schema
-- ============================================================

-- 投稿テーブル
CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  text_norm   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  is_hidden   INTEGER NOT NULL DEFAULT 0,
  deleted_at     INTEGER,
  deleted_reason TEXT,
  deleted_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_deleted, is_hidden, created_at);

-- 投票テーブル
CREATE TABLE IF NOT EXISTS votes (
  id                TEXT PRIMARY KEY,
  item_id           TEXT NOT NULL,
  value             INTEGER NOT NULL CHECK(value IN (-1, 1)),
  created_at        INTEGER NOT NULL,
  fingerprint_hash  TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_votes_item_created ON votes(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_item_fp_created ON votes(item_id, fingerprint_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_fp_created ON votes(fingerprint_hash, created_at);

-- 通報テーブル
CREATE TABLE IF NOT EXISTS reports (
  id                TEXT PRIMARY KEY,
  item_id           TEXT NOT NULL,
  reason            TEXT NOT NULL CHECK(reason IN ('spam','hate','sexual','personal_info','violence','other')),
  comment           TEXT,
  created_at        INTEGER NOT NULL,
  fingerprint_hash  TEXT NOT NULL,
  is_resolved       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_item ON reports(item_id);

-- BANテーブル
CREATE TABLE IF NOT EXISTS bans (
  fingerprint_hash  TEXT PRIMARY KEY,
  banned_until      INTEGER NOT NULL,
  note              TEXT,
  created_at        INTEGER NOT NULL
);

-- 管理者操作 監査ログ
CREATE TABLE IF NOT EXISTS admin_actions (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at);

-- ============================================================
-- 将来のスケール向け集計テーブル（参考設計・未使用）
-- ============================================================
-- CREATE TABLE IF NOT EXISTS vote_agg_hourly (
--   item_id     TEXT NOT NULL,
--   hour_bucket INTEGER NOT NULL,   -- epoch ms を 3600000 で割った値
--   pos_sum     INTEGER NOT NULL DEFAULT 0,
--   neg_sum     INTEGER NOT NULL DEFAULT 0,
--   PRIMARY KEY (item_id, hour_bucket)
-- );

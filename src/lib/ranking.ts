/**
 * ランキング・時間減衰スコア
 *
 * 重み定数（将来調整しやすいよう一箇所に集約）:
 *   0〜1時間   : 1.0
 *   1〜6時間   : 0.6
 *   6〜24時間  : 0.3
 *   1〜7日     : 0.1
 *   7日〜      : 0.03
 */

/** 時間帯の境界値（ミリ秒） */
export const DECAY_BOUNDARIES = {
  HOUR_1: 1 * 60 * 60 * 1000,       //   3,600,000
  HOUR_6: 6 * 60 * 60 * 1000,       //  21,600,000
  HOUR_24: 24 * 60 * 60 * 1000,     //  86,400,000
  DAY_7: 7 * 24 * 60 * 60 * 1000,   // 604,800,000
} as const;

/** 重み定数 */
export const DECAY_WEIGHTS = {
  WITHIN_1H: 1.0,
  WITHIN_6H: 0.6,
  WITHIN_24H: 0.3,
  WITHIN_7D: 0.1,
  OLDER: 0.03,
} as const;

/**
 * D1 (SQLite) 用のランキングクエリ
 *
 * パラメータ:
 *   :now    - 現在時刻 (epoch ms)
 *   :limit  - 取得件数
 *   :offset - オフセット
 */
export const RANKING_QUERY = `
SELECT
  i.id,
  i.text,
  i.created_at,
  COALESCE(SUM(
    v.value * CASE
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.HOUR_1}  THEN ${DECAY_WEIGHTS.WITHIN_1H}
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.HOUR_6}  THEN ${DECAY_WEIGHTS.WITHIN_6H}
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.HOUR_24} THEN ${DECAY_WEIGHTS.WITHIN_24H}
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.DAY_7}   THEN ${DECAY_WEIGHTS.WITHIN_7D}
      ELSE ${DECAY_WEIGHTS.OLDER}
    END
  ), 0) AS score,
  COALESCE(SUM(CASE WHEN v.value =  1 THEN 1 ELSE 0 END), 0) AS pos_count,
  COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS neg_count
FROM items i
LEFT JOIN votes v ON v.item_id = i.id
WHERE i.is_deleted = 0 AND i.is_hidden = 0
GROUP BY i.id
ORDER BY score DESC, i.created_at DESC
LIMIT :limit OFFSET :offset
`;

/** 新着クエリ */
export const NEW_ITEMS_QUERY = `
SELECT
  i.id,
  i.text,
  i.created_at,
  COALESCE(SUM(
    v.value * CASE
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.HOUR_1}  THEN ${DECAY_WEIGHTS.WITHIN_1H}
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.HOUR_6}  THEN ${DECAY_WEIGHTS.WITHIN_6H}
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.HOUR_24} THEN ${DECAY_WEIGHTS.WITHIN_24H}
      WHEN (:now - v.created_at) < ${DECAY_BOUNDARIES.DAY_7}   THEN ${DECAY_WEIGHTS.WITHIN_7D}
      ELSE ${DECAY_WEIGHTS.OLDER}
    END
  ), 0) AS score,
  COALESCE(SUM(CASE WHEN v.value =  1 THEN 1 ELSE 0 END), 0) AS pos_count,
  COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS neg_count
FROM items i
LEFT JOIN votes v ON v.item_id = i.id
WHERE i.is_deleted = 0 AND i.is_hidden = 0
GROUP BY i.id
ORDER BY i.created_at DESC
LIMIT :limit OFFSET :offset
`;

/** 自動非表示の通報数しきい値 */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

/** 投票重複チェック期間（24時間 ms） */
export const VOTE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

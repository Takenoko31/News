/**
 * NGワード辞書（サーバサイド専用）
 *
 * カテゴリ:
 *   - violence: 暴力扇動・脅迫
 *   - hate: 差別・ヘイトスピーチ
 *   - sexual: 露骨な性的表現
 *   - spam: スパムパターン
 *
 * ※ このファイルはWorkers上でのみ実行され、フロントには公開されない。
 * ※ パターンはNFKC正規化済みテキストに対して適用する。
 */

const VIOLENCE_WORDS: string[] = [
  '殺す', '殺せ', '殺してやる', '殺すぞ',
  '死ね', '死ねば', 'しね',
  '爆破', '爆破する', '放火',
  '襲撃', '刺す', '刺してやる',
];

const HATE_WORDS: string[] = [
  'ガイジ', 'きちがい', 'キチガイ', '池沼',
  '土人', 'チョン', 'シナ人',
  '障害者は', '部落',
];

const SEXUAL_WORDS: string[] = [
  'セックス', 'オナニー', 'レイプ',
  '中出し', 'フェラ', 'パイズリ',
  'まんこ', 'ちんこ', 'ちんぽ',
];

const SPAM_PATTERNS: RegExp[] = [
  /(.)\1{9,}/,                     // 同一文字10連続以上
  /line\s*@/i,                     // LINE ID誘導
  /副業|即日.*万円|稼げる/,          // 金銭スパム
];

/** NGワードリスト（全カテゴリ統合、小文字化済み） */
const ALL_NG_WORDS: string[] = [
  ...VIOLENCE_WORDS,
  ...HATE_WORDS,
  ...SEXUAL_WORDS,
].map((w) => w.toLowerCase());

/**
 * NGワードチェック（正規化済みテキストに対して実行）
 * @returns マッチしたカテゴリ文字列 or null（問題なし）
 */
export function checkNgWords(normalizedText: string): string | null {
  const lower = normalizedText.toLowerCase();

  for (const word of VIOLENCE_WORDS) {
    if (lower.includes(word.toLowerCase())) return 'violence';
  }
  for (const word of HATE_WORDS) {
    if (lower.includes(word.toLowerCase())) return 'hate';
  }
  for (const word of SEXUAL_WORDS) {
    if (lower.includes(word.toLowerCase())) return 'sexual';
  }
  for (const pat of SPAM_PATTERNS) {
    if (pat.test(normalizedText)) return 'spam';
  }

  return null;
}

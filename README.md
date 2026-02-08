# バケットリスト人気投票サイト

Cloudflare Pages + Workers + D1 + Turnstile で動作する、匿名の「やりたいこと」人気投票サービスです。

## リポジトリ構成

```
├── src/                        # Workers API (TypeScript / Hono)
│   ├── index.ts               # エントリポイント
│   ├── types.ts               # 型定義
│   ├── routes/
│   │   ├── items.ts           # GET/POST /api/items
│   │   ├── votes.ts           # POST /api/votes
│   │   ├── reports.ts         # POST /api/reports
│   │   └── admin.ts           # 管理者 API
│   ├── middleware/
│   │   ├── turnstile.ts       # Turnstile 検証
│   │   ├── rate-limit.ts      # レート制限
│   │   └── auth.ts            # JWT 管理者認証
│   └── lib/
│       ├── fingerprint.ts     # HMAC フィンガープリント
│       ├── validation.ts      # Zod スキーマ & テキスト検証
│       ├── ngwords.ts         # NGワード辞書（サーバ専用）
│       ├── jwt.ts             # JWT 署名/検証
│       └── ranking.ts         # 時間減衰スコア定数 & クエリ
├── web/                        # 静的フロント (Cloudflare Pages)
│   ├── index.html             # トップページ
│   ├── admin.html             # 管理画面
│   ├── css/style.css
│   └── js/
│       ├── config.js          # ★ API URL / Turnstile Site Key
│       ├── app.js             # メインJS
│       └── admin.js           # 管理画面JS
├── migrations/
│   └── 0001_init.sql          # D1 スキーマ
├── wrangler.toml               # Workers 設定
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## 前提条件

- **Node.js** 18 以上
- **npm** または **pnpm**
- **Cloudflare アカウント**（無料プランで OK）
- **wrangler CLI**（`npm install -g wrangler` または devDependencies に含まれています）

---

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <your-repo-url>
cd bucket-list-voting
npm install
```

### 2. Cloudflare にログイン

```bash
npx wrangler login
```

ブラウザが開くので Cloudflare アカウントで認証してください。

### 3. D1 データベースの作成

```bash
npx wrangler d1 create bucket-list-db
```

出力される `database_id` をコピーし、`wrangler.toml` の `database_id` に貼り付けてください。

```toml
[[d1_databases]]
binding = "DB"
database_name = "bucket-list-db"
database_id = "ここにIDを貼る"
```

### 4. マイグレーション実行

```bash
# ローカル開発用
npm run db:migrate:local

# 本番用（リモートD1）
npm run db:migrate
```

### 5. Turnstile の設定

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン
2. 左メニュー → **Turnstile** → **サイトを追加**
3. サイト名: 任意（例: `bucket-list`）
4. ドメイン: Pages のドメイン（例: `bucket-list-web.pages.dev`）+ ローカル開発用に `localhost`
5. ウィジェットタイプ: **Managed**
6. 作成後に表示される以下をメモ:
   - **Site Key**（公開鍵）→ `web/js/config.js` に設定
   - **Secret Key**（秘密鍵）→ Workers のシークレットに設定

### 6. Workers のシークレット設定

以下の 4 つを設定します:

```bash
# Turnstile の Secret Key
npx wrangler secret put TURNSTILE_SECRET

# フィンガープリント生成用の秘密鍵（ランダム文字列を入力）
npx wrangler secret put FINGERPRINT_SECRET

# 管理者パスワード
npx wrangler secret put ADMIN_PASSWORD

# JWT 署名用の秘密鍵（ランダム文字列を入力）
npx wrangler secret put JWT_SECRET
```

> **ランダム文字列の生成例**: `openssl rand -hex 32`

### 7. フロントエンドの設定

`web/js/config.js` を編集:

```javascript
const CONFIG = {
  API_BASE: 'https://bucket-list-api.your-subdomain.workers.dev',  // Workers URL
  TURNSTILE_SITE_KEY: '0x4AAAAAAA...',  // Turnstile Site Key
};
```

### 8. CORS 設定

`wrangler.toml` の `ALLOWED_ORIGIN` を Pages のドメインに変更:

```toml
[vars]
ALLOWED_ORIGIN = "https://bucket-list-web.pages.dev"
```

---

## ローカル開発

```bash
# Workers API を起動（ポート 8787）
npm run dev

# 別ターミナルでフロントを起動（ポート 8080）
npm run dev:web
```

ローカル開発時は `web/js/config.js` の `API_BASE` を `http://localhost:8787` に設定してください。

> ローカル開発用のシークレットは `.dev.vars` ファイルに記述できます:
>
> ```
> TURNSTILE_SECRET=1x0000000000000000000000000000000AA
> FINGERPRINT_SECRET=local-dev-secret
> ADMIN_PASSWORD=admin123
> JWT_SECRET=local-jwt-secret
> ```
>
> ※ Turnstile のテスト用キー: Site Key `1x00000000000000000000AA`, Secret Key `1x0000000000000000000000000000000AA`（常に成功）

---

## デプロイ

### Workers API のデプロイ

```bash
npm run deploy
```

デプロイ後に表示される URL をメモしてください（例: `https://bucket-list-api.xxx.workers.dev`）。

### Pages（フロント）のデプロイ

**方法 A: wrangler pages deploy**

```bash
npm run deploy:web
```

**方法 B: GitHub 連携（推奨）**

1. Cloudflare ダッシュボード → **Pages** → **プロジェクトを作成**
2. GitHub リポジトリを接続
3. ビルド設定:
   - **ビルドコマンド**: （空欄のまま）
   - **ビルド出力ディレクトリ**: `web`
4. デプロイ

---

## API 仕様

### 公開 API

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/items?sort=ranking\|new&limit=50&offset=0` | 投稿一覧（ランキング or 新着） |
| `POST` | `/api/items` | 投稿作成 |
| `POST` | `/api/votes` | 投票 |
| `POST` | `/api/reports` | 通報 |
| `GET` | `/api/health` | ヘルスチェック |

### 管理者 API

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/api/admin/login` | ログイン |
| `POST` | `/api/admin/logout` | ログアウト |
| `GET` | `/api/admin/reports` | 通報一覧 |
| `POST` | `/api/admin/items/:id/delete` | 投稿の論理削除 |
| `POST` | `/api/admin/items/:id/unhide` | 非表示解除 |
| `POST` | `/api/admin/bans` | BAN |
| `GET` | `/api/admin/actions` | 監査ログ |

### リクエスト / レスポンス例

**投稿作成**
```json
POST /api/items
{
  "text": "オーロラを見に行きたい",
  "turnstile_token": "..."
}
→ 201 { "id": "...", "text": "オーロラを見に行きたい", "created_at": 1700000000000 }
```

**投票**
```json
POST /api/votes
{
  "item_id": "uuid",
  "value": 1,
  "turnstile_token": "..."
}
→ 201 { "ok": true, "vote_id": "..." }
```

**エラーレスポンス（共通）**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "投稿頻度が高すぎます。しばらく待ってください"
  }
}
```

---

## ランキング仕様（時間減衰スコア）

投票時刻と現在時刻の差に応じた重みでスコアを計算:

| 経過時間 | 重み |
|---------|------|
| 0〜1 時間 | 1.0 |
| 1〜6 時間 | 0.6 |
| 6〜24 時間 | 0.3 |
| 1〜7 日 | 0.1 |
| 7 日〜 | 0.03 |

```
score = Σ (vote_value × weight)
```

---

## セキュリティ

### 実装済み対策

- **XSS**: DOM操作は `textContent` 使用。投稿テキストを HTML として解釈させない
- **入力バリデーション**: 全 API でサーバサイド Zod バリデーション必須
- **Turnstile**: 投稿・投票・通報で bot 防止
- **Rate Limit**: Workers 側で固定ウィンドウ方式のレート制限
- **NGワード**: サーバサイドで NFKC 正規化後にチェック（辞書は非公開）
- **URL/メール/電話番号検出**: 個人情報漏洩防止
- **フィンガープリント**: IP+UA+Lang の HMAC ハッシュのみ保存（生IP非保存）
- **管理者認証**: JWT (HS256) + HttpOnly Cookie / Authorization ヘッダー
- **CORS**: 許可オリジンを限定
- **監査ログ**: 管理者操作はすべて記録
- **自動非表示**: 通報 3 件以上で投稿を自動非表示

### 運用上の注意

- `ADMIN_PASSWORD` / `JWT_SECRET` / `FINGERPRINT_SECRET` は十分に長いランダム文字列を使用すること
- 定期的に `npm audit` を実行し脆弱性を確認
- D1 のバックアップは Cloudflare ダッシュボードから確認可能
- レート制限はインメモリ実装のため、Worker の再起動でリセットされる。大規模運用では KV に移行を検討
- Turnstile のテスト用キーは本番では絶対に使用しないこと

---

## 本番運用チェックリスト

- [ ] `wrangler.toml` の `database_id` を設定した
- [ ] 4 つの Secrets をすべて設定した
- [ ] `web/js/config.js` の `API_BASE` と `TURNSTILE_SITE_KEY` を設定した
- [ ] `wrangler.toml` の `ALLOWED_ORIGIN` を Pages ドメインに設定した
- [ ] マイグレーションをリモート D1 に適用した
- [ ] Turnstile のドメインに本番ドメインを追加した
- [ ] `npm audit` で脆弱性がないことを確認した
- [ ] 管理画面 (`/admin.html`) にログインできることを確認した

---

## 追加改善案

### スケール対応
- レート制限を KV / Durable Objects に移行
- 集計テーブル `vote_agg_hourly` を導入し、ランキング計算を高速化（設計は `migrations/0001_init.sql` にコメントとして記載）
- Cloudflare Cache API でランキング結果をキャッシュ（TTL: 30秒〜1分）

### モデレーション強化
- AI による自動モデレーション（Cloudflare Workers AI 連携）
- 通報理由ごとの自動非表示しきい値の調整
- 管理者の複数アカウント対応
- Slack / Discord への通報通知 Webhook

### 機能拡張
- カテゴリ・タグ機能
- 投稿の共有リンク
- ユーザーごとの投票済みマーク（Cookie / localStorage）
- PWA 対応（オフライン表示）

# かんたん家計簿

家計簿が続かない人向けの、日本語自然文入力を中心にした家計簿Webアプリです。「セブンでお昼 680円」のように入力すると、金額・店名・カテゴリー・日付・食費の削減可能性を推定して登録できます。

## 主な機能

- LINE風の自然文入力と登録前確認（そのまま登録／内容を編集／入力し直す）
- キーワード・店舗辞書・日付正規表現による自動分類（外部AI API不要）
- 分類の信頼度表示と、店名を優先したユーザー修正ルールの学習
- 支出・収入別のカスタムカテゴリー追加、編集、停止、安全な削除
- 月収・貯金目標・カテゴリー予算、使いすぎ判定と月末予測
- 食費の必要支出／削減可能支出の分析
- 支出予定と支払い済みを分けた固定費の毎月自動作成（重複防止）
- 月間カレンダー、履歴、編集、削除、レスポンシブUI
- PostgreSQL接続を確認する `/health`

## スクリーンショット

スクリーンショットは `docs/screenshots/` に配置してください。

## 使用技術

Node.js 20+、Express、EJS、PostgreSQL、HTML、CSS、JavaScript、Node.js標準テスト。

## ディレクトリ構成

```text
src/
  db/          DB接続・初期化・スキーマ
  services/    自然文解析・家計計算
  app.js       ルートとアプリ本体
  server.js    起動処理
views/         EJS画面
public/        CSS・ブラウザJavaScript
test/          自動テスト
render.yaml    Render Blueprint
```

## ローカル起動

1. PostgreSQLで空のデータベースを作ります。
2. `.env.example` を `.env` にコピーし、値を変更します。
3. `npm install`
4. `npm run db:init`（何度実行しても安全です）
5. 必要なら `npm run db:seed`
6. `npm start` 後、`http://localhost:3000` を開きます。

## 環境変数

- `PORT`: Webサーバーのポート（既定3000、Renderでは自動設定）
- `DATABASE_URL`: PostgreSQL接続文字列
- `SESSION_SECRET`: 十分に長いランダム文字列
- `NODE_ENV`: ローカルは `development`、本番は `production`

本番時はPostgreSQLへSSL接続します。`.env` は `.gitignore` の対象です。

## PostgreSQLとテーブル作成

`createdb kantan_kakeibo` 等でDBを作成し、`DATABASE_URL` を設定してください。`npm run db:init` は `CREATE TABLE IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS` と競合を無視する初期値登録を使います。アプリ起動時にも同じ処理を安全に実行します。既存のカテゴリー名は残したまま `category_id` を追加して関連付けるため、既存記録を保持して更新できます。

## テスト

`npm test` で自然文の金額・日付・カテゴリー・食費判定・学習ルール・家計計算に加え、編集値の金額・日付・カテゴリー種別・有効状態の検証を行います。

## Renderへデプロイ

### Blueprintを使う場合

GitHubリポジトリをRenderのNew Blueprintから選ぶと、`render.yaml` が無料PostgreSQLとWeb Service、`DATABASE_URL`、`NODE_ENV`、ランダムな`SESSION_SECRET`を設定します。

### 手動の場合

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- PostgreSQLのInternal Database URLを`DATABASE_URL`に設定
- `NODE_ENV=production`、長いランダム値の`SESSION_SECRET`を設定

## セキュリティ

SQLはすべてプレースホルダを使用し、金額・日付・カテゴリーを検証します。EJSのエスケープ、Helmet、HttpOnly/SameSite Cookie、本番用の簡略エラー画面を利用し、秘密情報は環境変数のみから読みます。

## 今後の改善案

ログインと複数ユーザー対応、CSRFトークン、分類候補を複数提示するUI、定期収入、CSV入出力、通知、任意のAI APIによる補助解析、より多くの自動ブラウザE2Eテストが候補です。
# かんたん家計簿

家計簿が続かない人向けの、日本語自然文入力を中心にした家計簿Webアプリです。「セブンでお昼 680円」のように入力すると、金額・店名・カテゴリー・日付・食費の削減可能性を推定して登録できます。

## 主な機能

- LINE風の自然文入力と登録前確認
- キーワード・店舗辞書・日付正規表現による自動分類（外部AI API不要）
- 分類の信頼度表示と、ユーザー修正ルールの学習
- 月収・貯金目標・カテゴリー予算、使いすぎ判定と月末予測
- 食費の必要支出／削減可能支出の分析
- 支出予定と支払い済みを分けた固定費の毎月自動作成（重複防止）
- 月間カレンダー、履歴、編集、削除、レスポンシブUI
- PostgreSQL接続を確認する `/health`

## スクリーンショット

スクリーンショットは `docs/screenshots/` に配置してください。

## 使用技術

Node.js 20+、Express、EJS、PostgreSQL、HTML、CSS、JavaScript、Node.js標準テスト。

## ディレクトリ構成

```text
src/
  db/          DB接続・初期化・スキーマ
  services/    自然文解析・家計計算
  app.js       ルートとアプリ本体
  server.js    起動処理
views/         EJS画面
public/        CSS・ブラウザJavaScript
test/          自動テスト
render.yaml    Render Blueprint
```

## ローカル起動

1. PostgreSQLで空のデータベースを作ります。
2. `.env.example` を `.env` にコピーし、値を変更します。
3. `npm install`
4. `npm run db:init`（何度実行しても安全です）
5. 必要なら `npm run db:seed`
6. `npm start` 後、`http://localhost:3000` を開きます。

## 環境変数

- `PORT`: Webサーバーのポート（既定3000、Renderでは自動設定）
- `DATABASE_URL`: PostgreSQL接続文字列
- `SESSION_SECRET`: 十分に長いランダム文字列
- `NODE_ENV`: ローカルは `development`、本番は `production`

本番時はPostgreSQLへSSL接続します。`.env` は `.gitignore` の対象です。

## PostgreSQLとテーブル作成

`createdb kantan_kakeibo` 等でDBを作成し、`DATABASE_URL` を設定してください。`npm run db:init` は `CREATE TABLE IF NOT EXISTS` と競合を無視する初期値登録を使います。アプリ起動時にも同じ処理を安全に実行します。

## テスト

`npm test` で自然文の金額・日付・カテゴリー・食費判定・学習ルール・家計計算を検証します。

## Renderへデプロイ

### Blueprintを使う場合

GitHubリポジトリをRenderのNew Blueprintから選ぶと、`render.yaml` が無料PostgreSQLとWeb Service、`DATABASE_URL`、`NODE_ENV`、ランダムな`SESSION_SECRET`を設定します。

### 手動の場合

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- PostgreSQLのInternal Database URLを`DATABASE_URL`に設定
- `NODE_ENV=production`、長いランダム値の`SESSION_SECRET`を設定

## セキュリティ

SQLはすべてプレースホルダを使用し、金額・日付・カテゴリーを検証します。EJSのエスケープ、Helmet、HttpOnly/SameSite Cookie、本番用の簡略エラー画面を利用し、秘密情報は環境変数のみから読みます。

## 今後の改善案

ログインと複数ユーザー対応、CSRFトークン、分類候補を複数提示するUI、定期収入、CSV入出力、通知、任意のAI APIによる補助解析、より多くの自動ブラウザE2Eテストが候補です。

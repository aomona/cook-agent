# cook-agent

AI 支援型の調理システムのプロトタイプです。

プロダクトは大きく 2 つのフェーズで構成されています。

1. 計画フェーズ
   - 1 つ以上のレシピ URL と人数を受け取る
   - レシピ情報を構造化された実行計画に変換する
   - 計画を機械可読な JSON として表現する
   - 計画をタイムライン形式の UI に表示し、ユーザーが確認・修正できるようにする
2. リアルタイム調理フェーズ
   - 調理中に手順を 1 ステップずつ案内する
   - 遅延、ミス、進捗更新、材料不足に応答する
   - 全体を再生成するのではなく、影響を受けた部分だけを再計画する

このリポジトリは、本番向けのキッチンプラットフォームではなく、UX とエージェント挙動を検証するためのプロトタイプです。

## 技術スタック

- Next.js 16 App Router
- React 19
- strict TypeScript
- pnpm workspace 構成。アプリ本体は `src/`、共通 UI は `workspaces/ui`
- Tailwind CSS v4
- Yamada UI
- Drizzle ORM + Neon serverless driver
- Better Auth
- AI SDK
- Biome
- Vitest + React Testing Library + jsdom

## リポジトリ構成

- `src/app/` - Next.js App Router のエントリポイントとルート
- `src/lib/` - auth や AI まわりのアプリロジック
- `src/db/` - Drizzle の schema と DB 接続処理
- `workspaces/ui/` - Yamada UI ベースの共通 UI export

主なパス:

- `src/app/page.tsx`
- `src/app/plan/page.tsx`
- `src/app/api/auth/[...all]/route.ts`
- `src/lib/ai/planner.ts`
- `src/lib/auth.ts`
- `src/db/schema.ts`
- `drizzle.config.ts`
- `vitest.config.ts`

## プロダクト上の制約

- レシピの元データと実行計画は分離して扱う
- plan は安定した JSON フレンドリーな構造を優先する
- 実行時イベントでは、影響を受けた部分だけを更新できるようにする
- 重い抽象化より、反復しやすさと分かりやすさを優先する

## セットアップ

### 前提

- Node.js 20+
- pnpm
- Postgres 互換の `DATABASE_URL`
- auth フローを使う場合は GitHub OAuth credentials

### インストール

```bash
pnpm install
```

### 環境変数

ローカルの `.env` を作成して、次の値を設定してください。

```bash
DATABASE_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OPENAI_API_KEY=
```

現在コード上で参照している環境変数:

- `DATABASE_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OPENAI_API_KEY`

## 開発

リポジトリルートで次を実行します。

```bash
pnpm dev
```

ブラウザで `http://localhost:3000` を開いてください。

その他の主要コマンド:

```bash
pnpm build
pnpm start
```

## 品質チェック

### Lint とフォーマット

```bash
pnpm lint
pnpm format
pnpm exec biome check --write <path>
```

### 型チェック

現時点では `package.json` に専用の `typecheck` script はありません。

```bash
pnpm exec tsc --noEmit
```

### テスト

Vitest はユニットテストとローカルなコンポーネントテスト向けに設定されています。

```bash
pnpm test
pnpm test:run
pnpm test:watch
pnpm test -- <path>
```

補足:

- `pnpm test` は通常のローカル開発向けフローで Vitest を実行します
- `pnpm test:run` は 1 回だけ実行し、テストがまだない状態でも `--passWithNoTests` で成功します
- Next.js の `async` Server Components は、ユニットテストより E2E テストを優先してください

## データベース

Drizzle の設定は `drizzle.config.ts` にあり、`.env` から `DATABASE_URL` を読み込みます。

よく使うコマンド:

```bash
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
```

## 認証

- Better Auth は `src/lib/auth.ts` で設定されています
- Next.js 側の auth handler は `src/app/api/auth/[...all]/route.ts` にあります
- GitHub OAuth は `GITHUB_CLIENT_ID` と `GITHUB_CLIENT_SECRET` を前提にしています

## テストに関するメモ

- Vitest の設定は `vitest.config.ts` にあります
- React コンポーネント系のユニットテストでは `jsdom` と React Testing Library を使えます
- `tsconfig.json` の path alias は Vite の `resolve.tsconfigPaths` で解決しています

## コーディング規約

- フォーマットと lint の基準は Biome を使う
- インデントはタブを使う
- JavaScript / TypeScript ではシングルクォートを使う
- 型専用 import は `import type` を使う
- ルートアプリの import では `@/` alias を優先する
- クライアント専用の挙動が必要になるまでは Server Components を優先する
- コメントは最小限にし、意図が分かりにくい箇所だけに付ける
- `any` は避け、明示的な型や `unknown` の絞り込みを使う

## このプロトタイプにおける完了条件

このプロトタイプで作業が完了したとみなせるのは、次の状態を満たしたときです。

- レシピ URL から構造化 plan を生成できる
- plan を UI に描画できる
- ユーザーが plan の修正を依頼できる
- 実行時イベントによって plan 更新をトリガーできる
- plan 変更後もアシスタントがガイダンスを継続できる
- 実装が理解しやすく、反復しやすい状態を保てている

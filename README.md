# cook-agent

AI 支援で調理計画を作り、調理中の進行も支援するプロトタイプです。

このリポジトリは本番向けのキッチンプラットフォームではなく、構造化された計画生成、計画編集、実行時ガイダンスの UX とエージェント挙動を検証するための実験実装です。

## Overview

プロダクトは大きく 2 つのフェーズで構成されています。

1. 計画フェーズ
   - 1 つ以上のレシピ URL を取り込みます
   - レシピを正規化し、人数やキッチン制約を加味して構造化 plan を生成します
   - 生成した plan をタイムラインとステップカードとして確認できます
   - 生成後の工程は編集画面から再生成・改善できます
2. リアルタイム調理フェーズ
   - 生成済み plan をもとに調理セッションを開始します
   - ステップ進行、タイマー、遅延、ミス、材料不足をイベントとして扱います
   - 必要に応じて runtime replan を要求できる設計になっています

このプロトタイプでは、レシピの元データと execution plan を分離して保持し、実行中は全体を作り直すのではなく影響範囲だけを更新しやすい形を優先しています。

## Current Workflow

1. GitHub ログインでアプリに入る
2. `/create/start` から下書き plan を作成する
3. レシピを追加し、人数を設定する
4. 構造化された工程を生成する
5. `/plans/[planId]` でレシピ要約、材料、タイムライン、工程一覧を確認する
6. `/plans/[planId]/edit` で工程を改善する
7. `/plans/[planId]/cook` で realtime cook runtime を開始する

## Tech Stack

- Next.js 16 App Router
- React 19
- strict TypeScript
- pnpm workspace
- Yamada UI + `workspaces/ui` の共通 UI package
- Drizzle ORM + PostgreSQL
- Better Auth + GitHub OAuth
- AI SDK + OpenAI
- Google GenAI SDK
- Tavily
- Oxlint + Oxfmt
- Vitest + React Testing Library + jsdom

## Repository Structure

- `src/app/`
  Next.js App Router の画面と route handler。
- `src/lib/ai/`
  planner と web search / extraction の実装。
- `src/lib/plans/`
  plan schema、型、scheduler、presentation、query ロジック。
- `src/lib/cook-runtime/`
  realtime 調理セッション、イベント、タイマー、live runtime の実装。
- `src/lib/recipes/`
  レシピ要約、正規化、人数調整の処理。
- `src/db/`
  Drizzle schema、auth schema、DB 接続。
- `workspaces/ui/`
  Yamada UI を再 export する共通 UI workspace。

主要ファイル:

- `src/app/page.tsx`
- `src/app/create/page.tsx`
- `src/app/plans/[planId]/page.tsx`
- `src/app/plans/[planId]/edit/page.tsx`
- `src/app/plans/[planId]/cook/page.tsx`
- `src/lib/ai/planner.ts`
- `src/lib/cook-runtime/live.ts`
- `src/lib/plans/schema.ts`
- `src/lib/plans/types.ts`
- `src/db/schema.ts`
- `drizzle.config.ts`

## Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL に接続できる `DATABASE_URL`
- GitHub OAuth application
- OpenAI API key
- Gemini API key
- Tavily API key

## Setup

依存関係をインストールします。

```bash
pnpm install
```

リポジトリルートに `.env` を作成し、次の環境変数を設定します。

```bash
DATABASE_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OPENAI_API_KEY=
GEMINI_API_KEY=
TAVILY_API_KEY=
```

環境変数の用途:

- `DATABASE_URL`
  Drizzle と Better Auth が使う PostgreSQL 接続文字列です。
- `GITHUB_CLIENT_ID`
  GitHub ログイン用の OAuth client id です。
- `GITHUB_CLIENT_SECRET`
  GitHub ログイン用の OAuth client secret です。
- `OPENAI_API_KEY`
  レシピ要約、人数調整、plan 生成で使います。
- `GEMINI_API_KEY`
  realtime cook runtime の live session で使います。
- `TAVILY_API_KEY`
  recipe URL の補助取得や planner / runtime の web search に使います。

`drizzle.config.ts` は `dotenv/config` を通じて `.env` の `DATABASE_URL` を読み込みます。

## Development

開発サーバーを起動します。

```bash
pnpm dev
```

ブラウザで `http://localhost:3000` を開きます。

トップページではセッションが無い場合にログインが必要です。実際に画面フローを確認するには GitHub OAuth の設定が必要です。

そのほかの主要コマンド:

```bash
pnpm build
pnpm start
```

## Quality Checks

Lint:

```bash
pnpm lint
```

Format:

```bash
pnpm format
pnpm exec oxlint --fix <path>
pnpm exec oxfmt <path>
```

Type check:

このリポジトリには専用の `typecheck` script はありません。

```bash
pnpm exec tsc --noEmit
```

Test:

```bash
pnpm test
pnpm test:run
pnpm test:watch
pnpm test -- <path>
```

Vitest は `jsdom` 環境で `src/**/*.{test,spec}.{ts,tsx}` と `workspaces/**/*.{test,spec}.{ts,tsx}` を対象に実行します。

## Database

Drizzle schema は `src/db/schema.ts` にあります。主に次のデータを保持します。

- recipe source とその正規化結果
- plan 本体と version 履歴
- user ごとの planning settings
- cooking session、session event、session timer

よく使うコマンド:

```bash
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
```

## Architecture Notes

- plan は `version: 2` の安定した JSON schema で管理します
- plan step には `timeline`、`after`、`req`、`timers`、`recoveryTips` などを含めます
- planner は正規化済みレシピを主な入力として扱い、不足情報がある場合のみ web search を補助的に使います
- planning settings では調理器具数、食事制約、アレルゲン、調理可能時間を扱います
- realtime runtime では delay、mistake、ingredient shortage、timer などのイベントを保存します
- 再計画は runtime event を起点に部分的な更新へつなげる設計です

## Notes

- UI 文言と planner の自然言語出力は日本語が前提です
- `next.config.ts` では React Compiler を有効にしています
- lint の基準は `.oxlintrc.json`、フォーマットの基準は `.oxfmtrc.json` が source of truth です
- import では `@/` alias を使う構成です
- `workspaces/ui` は Yamada UI の再 export を担う薄い package です
- 現時点ではプロトタイプの反復速度を優先しており、重い抽象化よりも分かりやすい実装を優先しています

# Kan. Sheets BI (web-bi) — Claude 指示書

## プロジェクト概要

Google スプレッドシートのデータを読み込み、多彩なグラフで可視化し、ドラッグ&ドロップで
自由にレイアウトできるダッシュボードを構築する、PDF 出力対応・認証付きの Web アプリケーション。

詳細仕様は `docs/bi-tool-spec.md`、UI モックは `docs/KanBI_prot.jsx` を参照。

### 技術スタック

| レイヤー | 採用技術 |
|----------|----------|
| フレームワーク | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| グラフ | Apache ECharts（SVGレンダラ, `echarts-for-react`） |
| レイアウト | `react-grid-layout` |
| データ取得(client) | TanStack Query |
| 共有キャッシュ | Upstash Redis |
| DB / ORM | PostgreSQL (Neon/Supabase) / Prisma |
| 認証 | Auth.js v5 + Google OAuth |
| 検証 | Zod |
| i18n | next-intl |
| 観測性 | Sentry + 構造化ログ |
| PDF | Playwright (Chromium) |
| パッケージマネージャ | pnpm |
| テスト | Vitest |

## ルール

@.claude/rules/typescript.md
@.claude/rules/architecture.md
@.claude/rules/testing.md

## エージェント（.claude/agents/）

開発サイクル: **Planner → Generator → Evaluator** の順で使う。

| エージェント名 | 内容 |
|---|---|
| `planner` | アイデア（1〜4行）を詳細な製品仕様書（最大16機能・10スプリント）に展開する |
| `generator` | 仕様書の1スプリントを実装し、自己評価8項目をパスしてからエバリュエーターへ引き渡す |
| `evaluator` | 実装を実際に動かして評価し、合否と具体的な修正指示を出力する |

### いつエージェントサイクルを使うか

**サイクルを起動する（新機能・新スプリント）**:
- 複数ファイルにまたがる新機能の実装
- 仕様書（`docs/spec-*.md` または `docs/bi-tool-spec.md` の各フェーズ）に基づくスプリント実行

**直接対応する（サイクルを使わない）**:
- 既存コードの1ファイル以内のバグ修正・小改修
- 設定変更・ドキュメント更新・質問への回答

### サイクルの進め方（オーケストレーター手順）

```
仕様書がない場合:
  → planner を呼ぶ
  → docs/spec-<feature>.md が生成されるまで待つ
  （bi-tool-spec.md の §14 実装フェーズを基にスプリント分割してもよい）

実装ループ（全スプリント完了まで繰り返す）:
  1. generator を呼ぶ（sprint=N spec=docs/spec-<feature>.md）
  2. generator から「✅ 実装完了」が返ったら evaluator を呼ぶ（同じ引数）
  3a. evaluator「✅ 合格」→ N を +1 して 1. へ戻る
  3b. evaluator「❌ 不合格」→ 失敗レポートを添えて generator を再呼び出し（sprint=N）
  3c. 同一スプリントで3回連続不合格 → ループを停止しユーザーに報告
```

### エージェント間の情報の渡し方

- generator・evaluator には必ず `sprint=N spec=docs/spec-<feature>.md` を明示する
- evaluator が「❌ 不合格」を返したとき、失敗レポートを**要約せず全文**を generator に渡す
- スプリント番号の管理はオーケストレーター（メイン Claude）が行う

### オーケストレーターの禁止事項

- エージェントサイクル中にメイン Claude が自らコードを実装する
- evaluator を省略して次のスプリントへ進む
- 1回の generator 呼び出しで複数スプリントを実装させる
- 不合格レポートを要約・編集してから generator に渡す

## スキル（スラッシュコマンド）

| コマンド | 内容 |
|---|---|
| `/project:write-test` | テスト作成 |
| `/project:add-api` | API ルート（Route Handler/Server Action）のひな形生成 |
| `/project:db-migration` | Prisma スキーマ変更とマイグレーション実行支援 |
| `/project:code-review` | コードレビュー |

## 重要な設計メモ

- **データソースはトップレベル資産**（User 直下、Dashboard に従属しない）。設計判断時は必ず §8 のデータモデルを確認する。
- **middleware は認証のみ**。所有権・ロール認可は Route Handler / Server Action 側で必ず実施する（§7, §FR-6）。
- **Sheets アクセスは必ずサーバー側**。OAuth トークン・APIキーをクライアントに露出させない。
- **集計はサーバー側で確定**させる（query レイヤー）。キャッシュキーに query ハッシュを含める（§7a）。
- グラフは **ECharts の SVG レンダラ**を使用（a11y・CSP・PDF再現性のため）。データテーブルを併設する。
- PDF トークンは **単回使用(jti)・短命・{userId, dashboardId} 束縛・ヘッダ渡し**（query に載せない）。
- 詳細な技術判断・レビュー対応一覧は `docs/bi-tool-spec.md` の §0 改訂履歴を参照。

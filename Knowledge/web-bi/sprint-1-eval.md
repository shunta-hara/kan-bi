---
date: 2026-07-07
tags:
  - evaluation
  - sprint
  - pdf
  - middleware
project: web-bi
related:
  - "[[sprint-1-bugfix-dashboard]]"
---

# Sprint 1 評価結果: 合格

対象スプリント: Sprint 1（spec-bugfix-dashboard.md）
対象機能: FEAT-BF-001, FEAT-BF-002

## 評価サマリ

| 項目 | 結果 |
|---|---|
| TypeScript コンパイルエラー | 0 件 |
| テスト | 476/476 パス（100%） |
| `any` 型使用 | 0 件 |
| ハードコードシークレット | 0 件 |
| Must 機能完了条件 | 5/5（100%） |

## 静的チェック

- `pnpm exec tsc --noEmit`: エラー 0 件
- `pnpm vitest run`: 476/476 全パス
- `pnpm build`: ビルド成功（警告は既存ファイルの ESLint unused-vars のみ、Sprint 1 対象外）

## 仕様適合チェック

### FEAT-BF-001: ミドルウェア認証ガードから印刷パスを除外

| 受け入れ基準 | 実装 | 結果 |
|---|---|---|
| `/dashboards/any-id/print` がリダイレクトされない | `PRINT_PATH_REGEX = /^\/dashboards\/[^/]+\/print$/` で除外 | OK |
| 通常の `/dashboards` パスは引き続き保護 | 正常系テスト 9 ケース全パス | OK |
| ユニットテストに除外ケース追加 | 正常系4・異常系4・境界値2 = 計10ケース追加 | OK |

### FEAT-BF-002: ECharts 描画完了シグナルと Playwright 待機

| 受け入れ基準 | 実装 | 結果 |
|---|---|---|
| 全 ECharts `finished` 後に `window.__chartsReady = true` | `finishedCountRef` で集計、閾値到達でセット | OK |
| `waitForFunction` でグラフ描画を待機（固定 1500ms 廃止） | `waitForFunction("window.__chartsReady === true", { timeout: 15_000 })` | OK |
| 印刷モードで `animation: false` | `printMode ? { ...baseOption, animation: false } : baseOption` | OK |
| グラフなしダッシュボードでもフラグが立つ | `useEffect(() => { if (echartsWidgetCount === 0) window.__chartsReady = true; })` | OK |

## 実装済みファイル

- `src/lib/auth/protectedPaths.ts` — `PRINT_PATH_REGEX` 追加、`isProtectedPath` で除外
- `src/lib/auth/protectedPaths.test.ts` — FEAT-BF-001 向け 10 件追加
- `src/types/window.d.ts` — `window.__chartsReady` グローバル型宣言
- `src/components/charts/ChartWidget.tsx` — `printMode`・`onFinished` prop 追加
- `src/components/dashboard/PrintDashboard.tsx` — チャート完了集計・フラグセット実装
- `src/lib/pdf/playwrightPdf.ts` — `waitForFunction("window.__chartsReady === true")` に変更

## コード品質

- `any` 型: 0 件（`unknown` + 型ガードで対応済み）
- ハードコードシークレット: 0 件
- 推奨違反: 0 件

## 次スプリントへ

generator エージェントに `sprint=2 spec=docs/spec-bugfix-dashboard.md` を渡す。
対象機能: FEAT-BF-003（データ取得失敗表示）、FEAT-BF-007（Sentry ログ）。

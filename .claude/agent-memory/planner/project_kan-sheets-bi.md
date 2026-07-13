---
name: project-kan-sheets-bi
description: Kan. Sheets BI プロジェクトの仕様書構成と参照ドキュメントの場所
metadata:
  type: project
---

Kan. Sheets BI（web-bi）は、Google スプレッドシート連携・多彩なグラフ可視化・ドラッグ&ドロップレイアウト・PDF出力・認証付きの Web アプリ。2026-06-08 に最初の機能仕様書 `docs/spec-kan-sheets-bi.md` を作成した（19機能・10スプリント）。`src/` には実装済みのコンポーネント・ページが存在する。2026-07-06 に UI ポリッシュ仕様書 `docs/spec-ui-polish.md` を追加した（8機能・2スプリント）。2026-07-07 にダッシュボードバグ修正仕様書 `docs/spec-bugfix-dashboard.md` を追加した（8機能・4スプリント）。根本原因: PDF→ログインページは `PROTECTED_PREFIXES` が `/dashboards/:id/print` を保護対象にしてしまうため。ウィジェット再追加不可は `useActionState` 成功状態の残存とインライン `onClose` 参照変化による `useEffect` 即時発火。データソース表示不備はサイレントキャッチ（`catch { queryResult = null }`）でエラーが握り潰されること。ウィジェット見切れは `ChartWidget` に固定 `height={180}` を渡していること。

**Why**: 既に詳細な技術仕様書 `docs/bi-tool-spec.md`（v3、§0 改訂履歴に指摘A〜T・2-x・3-x）が存在し、技術スタック・データモデル(§8)・API設計(§9)・セキュリティ設計(§7)・実装フェーズ案(§14 Phase 0〜5)が確定している。プランナーの仕事はその技術仕様と矛盾しない「何を作るか」の機能仕様・スプリント分割を作ること。

**How to apply**: 今後この機能の続き（Sprint 11以降の追加や再計画）を行う際は、必ず `docs/bi-tool-spec.md` と `CLAUDE.md` を先に読み、§14 のフェーズ区切り（Phase 0:基盤/Phase 1:データレイヤー/Phase 2:可視化/Phase 3:レイアウト/Phase 4:PDF/Phase 5:セキュリティ仕上げ）とスプリント順序が整合するように組み立てる。スプリント順は「認証→データソース基盤→再利用/型→更新/アクセス権維持→ダッシュボード/ウィジェット→可視化拡充→レイアウト→PDF→セキュリティ仕上げ→国際化」とした（[[feedback-spec-format-bi-tool]] も参照）。

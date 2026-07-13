# テストルール

## テスト必須化

- 新規ロジック（特に `lib/query/`, `lib/sheets/` の正規化・集計、Zod スキーマ、キャッシュキー生成）には
  必ずテストを追加する。テストなしのロジック追加は完了とみなさない。
- テストには **正常系・異常系・境界値** を含める
  （例: 空データ、型推論の失敗、上限超過の `limit`、owner 不一致 403 など）。

## テスト方針（仕様書 §13 準拠）

| 種別 | 対象 |
|---|---|
| 単体 | query 適用ロジック、列型推論/上書き、`config` の Zod 検証、キャッシュキー生成 |
| 結合 | Sheets 取得（OAuth/公開のモック）、single-flight ロック、認可（owner 不一致で 403） |
| E2E (Playwright) | ログイン → データソース登録 → チャート作成 → レイアウト保存 → PDF 出力 |
| セキュリティ | 未認証リダイレクト、PDFトークンの単回使用・失効、CSP 非破綻、レート制限 |

## 実行コマンド

```bash
pnpm vitest run        # 単体・結合テスト
pnpm exec tsc --noEmit # 型チェック
pnpm build             # ビルド確認
```

- 外部 API（Google Sheets, Upstash Redis）はモックを使い、実サービスに接続しない。
- Server Action / Route Handler のテストは、認可（owner 一致/不一致）の両方のケースを必ず含める。

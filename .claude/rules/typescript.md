# TypeScript ルール

## any 禁止・型の集約管理

- `any` を使わない。外部入力（Sheets API レスポンス、フォーム入力、API リクエストボディ等）は
  必ず Zod スキーマで検証し、推論された型を使う。やむを得ず型が不明な場合は `unknown` を使い、
  型ガードで絞り込む。
- ドメイン共通の型・Zod スキーマは `src/types/` または各レイヤーの `schema.ts` に集約する。
  同じ型を複数箇所で再定義しない（`Widget.config` の discriminated union、`query` の型などは特に注意）。
- `Json` 型で永続化される値（`DataSource.columnTypes`, `Dashboard.layouts`, `Widget.query`/`config`）は
  DB 境界で必ず Zod パースしてから扱う。Prisma の `Json` をそのまま型として使わない。
- `schemaVersion` を持つ `config` 型は、バージョンごとにスキーマを分けてマイグレーション関数を用意する。

## 命名規則

- ファイル名・コンポーネント名・関数名は役割が一目で分かる名前にする（省略しすぎない）。
- Zod スキーマは `xxxSchema`、推論型は `Xxx`（例: `dataSourceSchema` / `DataSource`）のように対応させる。
- サーバー専用コード（OAuth トークン、Sheets API 呼び出し等）には `server` を含むモジュール名や
  ディレクトリ配置で「クライアントに含めてはいけない」ことを明示する。

## 検証

- 全 API 入力（Route Handler / Server Action）を Zod で検証してから処理する。
- `spreadsheetId` / `range` / `query` / `config` は形式チェック用の専用スキーマを用意する。

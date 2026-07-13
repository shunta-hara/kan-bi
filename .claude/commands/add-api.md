---
description: Route Handler または Server Action のひな形を仕様書（§9 API設計）に沿って生成する
---

追加対象: $ARGUMENTS

以下の手順で API のひな形を作成してください。

1. `docs/bi-tool-spec.md` の §9 API設計・§7 セキュリティ設計を確認し、対象パスの仕様（メソッド・認可要件・レート制限要否）を把握する
2. 入力（パスパラメータ・クエリ・ボディ）の Zod スキーマを `src/lib/<domain>/schema.ts` 等の集約場所に定義する（既存スキーマがあれば再利用する）
3. Route Handler（`src/app/api/.../route.ts`）または Server Action を作成し、以下を必ず実装する:
   - リクエスト入力の Zod 検証（失敗時は 400）
   - 認証チェック（未ログインは 401）— ただし middleware は認証のみなので、ここでは所有権・ロール認可を行う
   - 対象リソースの `ownerId` 照合（不一致は 403）
   - 必要に応じて Upstash Redis キャッシュ・レート制限（§7a, §7 参照）との連携
4. エラーハンドリングは仕様書の方針（構造化ログ・監査ログ対象かどうか）に従う
5. `@.claude/rules/typescript.md` / `architecture.md` に沿っているか確認し、対応するテスト（owner一致/不一致を含む）を `/project:write-test` で追加する

完了したら作成したファイル一覧と、認可・検証ロジックの要点を報告してください。

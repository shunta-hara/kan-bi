---
description: Prisma スキーマの変更とマイグレーション作成・適用を支援する
---

変更内容: $ARGUMENTS

以下の手順で進めてください。

1. `prisma/schema.prisma` を読み、`docs/bi-tool-spec.md` §8 のデータモデルと整合するか確認する
   （特に `DataSource` のトップレベル資産化、`Widget.dataSource` の `SetNull`、正規化方針）
2. スキーマを変更する。リレーションの `onDelete` 方針は仕様書の削除ポリシー（§8 末尾）に従う
3. マイグレーションを作成する:
   ```bash
   pnpm exec prisma migrate dev --name <変更内容を表す名前>
   ```
4. `pnpm exec prisma generate` を実行し、型を再生成する
5. 既存コードで型エラーが出ないか `pnpm exec tsc --noEmit` で確認する
6. 既存データへの影響（NOT NULL 化・リレーション変更など）がある場合は、マイグレーションファイルを確認し
   破壊的変更でないか・バックフィルが必要かを報告する

**注意**: 本番データベースに対して直接マイグレーションを適用するコマンド（`prisma migrate deploy` 等）は、
ユーザーの明示的な許可なく実行しない。

完了したらマイグレーション名・変更したモデル・型エラーの有無を報告してください。

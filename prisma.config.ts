import { defineConfig } from "@prisma/config";

/**
 * Prisma 7 設定ファイル。
 * Prisma 7 ではマイグレーション用の接続情報をスキーマファイルではなく
 * ここで定義する（datasource ブロックの `url` は廃止）。
 * 参考: https://pris.ly/d/config-datasource
 *
 * `@prisma/config` の `env()` ヘルパーは未解決の場合に例外を投げてしまい、
 * `.env.local`（Next.js の規約で利用）しか用意していないローカル環境や
 * `prisma generate`（DB接続を必要としない）を壊してしまうため、
 * ここでは `process.env` を直接参照し、未設定でも config の読み込み自体は失敗させない。
 * 実際の接続文字列の検証は Migrate/Studio 実行時に Prisma 側が行う。
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

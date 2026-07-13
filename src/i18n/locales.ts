/**
 * ロケール定義（FEAT-016 多言語対応 / Sprint 10）。
 *
 * このモジュールはサーバー専用モジュール（next-intl/server, next/headers）に
 * 依存しない純粋な定義であり、テストやクライアントコードからも参照できる。
 */

export const locales = ["ja", "en"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "ja";

/**
 * 文字列が有効なロケールかどうか検証する。
 * Cookie や URL パラメータからの入力を安全に確認するために使う。
 */
export function isValidLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

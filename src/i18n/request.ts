import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { locales, defaultLocale, isValidLocale } from "@/i18n/locales";
import type { AppLocale } from "@/i18n/locales";

// 外部からも参照できるよう re-export する（後方互換）
export { locales, defaultLocale };
export type { AppLocale };

/**
 * next-intl のリクエスト単位設定（FEAT-016 多言語対応）。
 *
 * - 対応ロケール: ja（日本語）、en（英語）
 * - ロケールの決定順序:
 *   1. Cookie "NEXT_LOCALE" の値
 *   2. デフォルト（ja）
 * - 将来的な Accept-Language ヘッダー対応も同ファイルで拡張できる。
 */
export default getRequestConfig(async () => {
  // Cookie からロケールを取得し、未設定またはサポート外の場合はデフォルトを使用する
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value ?? "";
  const locale: AppLocale = isValidLocale(cookieLocale)
    ? cookieLocale
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

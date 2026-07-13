/**
 * ロケール対応フォーマットユーティリティ（FEAT-016 多言語対応 / Sprint 10）。
 *
 * - このモジュールは next-intl/server・next/headers 等のサーバー専用 API に
 *   依存しない純粋な関数のみを提供する。vitest 等のテスト環境でも安全にインポートできる。
 * - 日付・数値の表示形式がロケールに応じて一箇所で管理されるようにし、
 *   将来的な英語（en-US）等への切り替えに対応しやすくする。
 * - 使用側は文字列ではなく `AppLocale` 型を受け取ることで、
 *   サポート外ロケールが誤って渡されないようにする。
 */

import type { AppLocale } from "@/i18n/locales";

/**
 * BCP 47 ロケールタグへのマッピング。
 * `AppLocale` の値が増えた場合はここに追加する。
 */
const BCP47: Record<AppLocale, string> = {
  ja: "ja-JP",
  en: "en-US",
};

/**
 * 日付を表示ロケールに対応した日時文字列に変換する。
 *
 * - 年・月・日・時・分を含める（秒は含めない）。
 * - 用途: ダッシュボード更新日時、データソース同期日時、PDF 生成日時等。
 *
 * @example
 * formatDateTime(new Date("2024-01-15T09:30:00"), "ja")
 * // → "2024年1月15日 09:30"
 *
 * @example
 * formatDateTime(new Date("2024-01-15T09:30:00"), "en")
 * // → "January 15, 2024, 09:30 AM" (en-US)
 */
export function formatDateTime(date: Date, locale: AppLocale): string {
  return date.toLocaleString(BCP47[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 日付を短形式の日時文字列に変換する（数字のみ、テーブル表示等の省スペース用途）。
 *
 * - 年・月・日・時・分を含む数値形式で出力する。
 * - 用途: データソースカードの更新日時など、スペースが限られた箇所。
 *
 * @example
 * formatDateTimeShort(new Date("2024-01-15T09:30:00"), "ja")
 * // → "2024/01/15 09:30"
 *
 * @example
 * formatDateTimeShort(new Date("2024-01-15T09:30:00"), "en")
 * // → "1/15/2024, 09:30 AM" (en-US)
 */
export function formatDateTimeShort(date: Date, locale: AppLocale): string {
  return date.toLocaleString(BCP47[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 数値をロケール対応の表示文字列に変換する。
 *
 * - 千区切り記号を付与する（例: 1,234,567）。
 * - 用途: KPI カードや数値テーブルの値表示。
 *
 * @example
 * formatNumber(1234567, "ja")  // → "1,234,567"
 * formatNumber(1234567, "en")  // → "1,234,567"
 */
export function formatNumber(value: number, locale: AppLocale): string {
  return value.toLocaleString(BCP47[locale]);
}

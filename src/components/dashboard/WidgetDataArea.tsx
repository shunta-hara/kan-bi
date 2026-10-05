"use client";

/**
 * ウィジェットカード内のグラフ表示エリア（FEAT-BF-003）。
 *
 * `WidgetCard` から切り出した表示専用コンポーネント。
 * データ取得状態（ok / no_datasource / error）に応じて
 * 適切な UI を描画する。挙動は切り出し前と同一。
 */

import { useTranslations } from "next-intl";

import { ChartWidget } from "@/components/charts/ChartWidget";
import type { WidgetDataStatus, WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

type Props = {
  /** データ取得状態（サーバーコンポーネントが生成） */
  dataStatus: WidgetDataStatus;
  /** 集計済みクエリ結果（status が "ok" のときのみ有効） */
  queryResult: QueryResult | null;
  /** ウィジェットタイトル（ChartWidget に渡す） */
  title: string;
  /** ウィジェット設定（ChartWidget に渡す） */
  config: WidgetConfig;
};

/**
 * データ取得状態に応じてグラフまたはエラー/未設定表示を描画する。
 *
 * - `ok` + `queryResult` あり → ChartWidget
 * - `error` + code `REAUTH_REQUIRED` → 再認可メッセージ + データソース設定リンク
 * - `error` その他 → 汎用エラーメッセージ
 * - `no_datasource` → データソース未設定メッセージ
 */
export function WidgetDataArea({
  dataStatus,
  queryResult,
  title,
  config,
}: Props) {
  const t = useTranslations("chartWidget");

  if (dataStatus.status === "ok" && queryResult !== null) {
    return <ChartWidget title={title} config={config} result={queryResult} />;
  }

  if (dataStatus.status === "error" && dataStatus.code === "REAUTH_REQUIRED") {
    return (
      <div
        className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-yellow-300 bg-yellow-50 py-6 dark:border-yellow-700 dark:bg-yellow-950"
        role="alert"
        aria-label={t("reauthRequiredAriaLabel")}
      >
        <p className="text-xs text-yellow-800 dark:text-yellow-200">
          {t("reauthRequiredMessage")}
        </p>
        <a
          href="/datasources"
          className="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {t("reauthRequiredLink")}
        </a>
      </div>
    );
  }

  if (dataStatus.status === "error") {
    return (
      <div
        className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-red-200 py-8 text-xs text-red-500 dark:border-red-800 dark:text-red-400"
        role="alert"
        aria-label={t("fetchErrorAriaLabel")}
      >
        {t("fetchErrorMessage")}
      </div>
    );
  }

  // no_datasource
  return (
    <div
      className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-black/10 py-8 text-xs text-black/40 dark:border-white/15 dark:text-white/60"
      aria-label={t("noDataSourceAriaLabel")}
      role="status"
    >
      {t("noDataSourceMessage")}
    </div>
  );
}

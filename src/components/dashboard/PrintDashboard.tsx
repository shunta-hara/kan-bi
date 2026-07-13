"use client";

/**
 * PDF 印刷用ダッシュボードコンポーネント（FEAT-013 / Sprint 8）。
 *
 * - Playwright がこのページをレンダリングして PDF を生成する。
 * - ECharts は "use client" が必要なため Client Component として実装する。
 * - 印刷専用スタイル（余白・改ページなし）。ダッシュボード名・生成日時を含める。
 * - グラフは SVG レンダラを使用するため PDF でも高品質に出力される。
 * - Sprint 10: ハードコードされた日本語文字列を next-intl の useTranslations に移行。
 */

import { useCallback, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ChartWidget } from "@/components/charts/ChartWidget";
import type { WidgetConfig, WidgetQuery } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";
import type { WidgetChartType } from "@/lib/dashboards/schema";
import { formatDateTime } from "@/i18n/localeUtils";
import type { AppLocale } from "@/i18n/locales";

type PrintWidget = {
  id: string;
  type: WidgetChartType;
  title: string | null;
  query: WidgetQuery;
  config: WidgetConfig;
  queryResult: QueryResult | null;
};

type Props = {
  title: string;
  description: string | null;
  widgets: PrintWidget[];
  generatedAt: Date;
};

/**
 * ダッシュボード印刷レイアウト。
 * - ヘッダー: ダッシュボード名・説明・生成日時
 * - ウィジェット一覧: 2 列グリッド
 *
 * FEAT-BF-002: 全 ECharts チャートの描画完了を追跡し、
 * 完了後に `window.__chartsReady = true` をセットする。
 * Playwright が `waitForFunction("window.__chartsReady === true")` でこのフラグを待機する。
 */
export function PrintDashboard({
  title,
  description,
  widgets,
  generatedAt,
}: Props) {
  const t = useTranslations("printDashboard");
  const locale = useLocale() as AppLocale;

  const formattedDate = formatDateTime(generatedAt, locale);

  // ECharts を使うウィジェット数を算出する（kpi / table は ReactECharts を使わない）
  const echartsWidgetCount = widgets.filter(
    (w) =>
      w.queryResult !== null &&
      w.config.chartType !== "kpi" &&
      w.config.chartType !== "table",
  ).length;

  // 各チャートの finished イベントを集計し、全完了時に window.__chartsReady をセットする
  const finishedCountRef = useRef(0);

  const handleChartFinished = useCallback(() => {
    finishedCountRef.current += 1;
    if (finishedCountRef.current >= echartsWidgetCount) {
      window.__chartsReady = true;
    }
  }, [echartsWidgetCount]);

  // ECharts チャートがゼロ（グラフなしダッシュボード）の場合は即時フラグを立てる
  useEffect(() => {
    if (echartsWidgetCount === 0) {
      window.__chartsReady = true;
    }
  }, [echartsWidgetCount]);

  return (
    <div
      className="min-h-screen bg-white p-8 font-sans text-black"
      style={{ colorScheme: "light" }}
    >
      {/* ヘッダー: ダッシュボード名・生成日時（仕様: 出力PDFに含める） */}
      <header className="mb-8 border-b border-black/15 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-black/60">{description}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-black/40">{t("generatedAtLabel")}</p>
            <p className="text-sm font-medium">{formattedDate}</p>
          </div>
        </div>
      </header>

      {/* ウィジェットグリッド */}
      {widgets.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-black/40">
          {t("noWidgetsMessage")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {widgets.map((widget) =>
            widget.queryResult !== null ? (
              <div
                key={widget.id}
                className="overflow-hidden rounded-xl border border-black/10"
              >
                <div className="px-4 pt-3 pb-1">
                  <span className="font-medium text-sm">
                    {widget.title ?? widget.type}
                  </span>
                </div>
                <div className="px-4 pb-4">
                  <ChartWidget
                    title={widget.title ?? widget.type}
                    config={widget.config}
                    result={widget.queryResult}
                    height={220}
                    printMode
                    onFinished={
                      widget.config.chartType !== "kpi" &&
                      widget.config.chartType !== "table"
                        ? handleChartFinished
                        : undefined
                    }
                  />
                </div>
              </div>
            ) : (
              <div
                key={widget.id}
                className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-black/15 text-xs text-black/40"
              >
                {(widget.title ?? widget.type) + t("noDataSuffix")}
              </div>
            ),
          )}
        </div>
      )}

      {/* フッター */}
      <footer className="mt-10 border-t border-black/10 pt-4 text-center text-xs text-black/40">
        {t("footerText", { date: formattedDate })}
      </footer>
    </div>
  );
}

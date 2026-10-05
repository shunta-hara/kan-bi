"use client";

/**
 * ChartWidget コンポーネント（FEAT-009 / FEAT-010 / Sprint 6）。
 *
 * - Apache ECharts（SVG レンダラ）でグラフを描画する。
 * - CLAUDE.md: "ECharts の SVG レンダラを使用（a11y・CSP・PDF再現性のため）"
 * - 同一ウィジェット内にデータテーブルを併設する（FEAT-010 / spec §9）。
 * - スクリーンリーダー対応: aria-label・role・tabIndex を適切に設定する。
 * - グラフ/テーブル切替タブはキーボードでも操作できる。
 * - Sprint 10: ハードコードされた日本語文字列を next-intl の useTranslations に移行。
 */

import { useCallback, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts/core";
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  FunnelChart,
  TreemapChart,
  GaugeChart,
  HeatmapChart,
  EffectScatterChart,
} from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent,
  GraphicComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { useLocale, useTranslations } from "next-intl";

import { buildChartOption } from "@/lib/query/chartOptions";
import type { WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";
import { formatNumber } from "@/i18n/localeUtils";
import type { AppLocale } from "@/i18n/locales";

// ECharts コンポーネント登録（SVG レンダラを使用）
echarts.use([
  SVGRenderer,
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  FunnelChart,
  TreemapChart,
  GaugeChart,
  HeatmapChart,
  EffectScatterChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent,
  GraphicComponent,
]);

type Tab = "chart" | "table";

type Props = {
  /** ウィジェットのタイトル（aria-label に使用） */
  title: string;
  /** `Widget.config`（Zod パース済み） */
  config: WidgetConfig;
  /** `applyQuery()` の結果 */
  result: QueryResult;
  /**
   * グラフの高さ（px）。
   * - 省略時（undefined）: CSS フィルモードで動作し、親コンテナの高さを 100% 埋める
   *   （WidgetCard での使用に推奨 — FEAT-BF-005）。
   * - 数値を指定した場合: その高さをピクセル値として使用する（PrintDashboard 等）。
   */
  height?: number;
  /**
   * 印刷モード（FEAT-BF-002）。
   * - `true` のとき ECharts のアニメーションを無効化する（`animation: false`）。
   *   描画が `setOption` の内部で同期的に完了するため、PDF のキャプチャ結果が安定する。
   *   なお、この場合 `finished` はイベント購読より前に発火して取り逃がすため、
   *   完了通知は `onChartReady` 経由でも行う（`onFinished` の説明を参照）。
   */
  printMode?: boolean;
  /**
   * チャートの描画完了時に呼ばれるコールバック（FEAT-BF-002）。
   * 印刷ページで全チャートの描画完了を `window.__chartsReady` フラグに反映するために使用する。
   * `printMode={true}` のときのみ有効にすることを推奨する。
   *
   * - 1 つのチャートにつき必ず 1 回だけ呼ばれる（ECharts の `finished` は複数回発火し得る）。
   * - `printMode` ではアニメーションが無く、`setOption` の内部で描画と `finished` が同期的に
   *   完了する。`echarts-for-react` はその後にイベントを購読するため `finished` を取り逃がす。
   *   そのため `onChartReady`（購読後に呼ばれる）の時点で描画済みとして通知する。
   */
  onFinished?: () => void;
};

/**
 * ECharts グラフ + データテーブル を切り替え表示するウィジェット。
 */
export function ChartWidget({
  title,
  config,
  result,
  height,
  printMode = false,
  onFinished,
}: Props) {
  const t = useTranslations("chartWidget");

  /**
   * CSS フィルモード（FEAT-BF-005）。
   * `height` が未指定の場合は親コンテナを 100% 埋める CSS ベースのサイズ追従を使用する。
   * 親コンテナが flex-1 / min-h-0 で高さを確保している必要がある（WidgetCard が対象）。
   */
  const isFillMode = height === undefined;

  const [activeTab, setActiveTab] = useState<Tab>(
    config.chartType === "table" ? "table" : "chart",
  );
  const chartRef = useRef<ReactECharts>(null);

  // 描画完了の通知は 1 チャートにつき 1 回に限る。
  // 複数回通知すると、呼び出し側のカウントが実際のチャート数を超えて早期に「完了」になる。
  // 通知するのは初回描画の完了のみで、同じインスタンスで option が差し替わっても再通知しない
  // （印刷ページは option が変わらない前提。再描画の完了通知が必要な用途では見直すこと）。
  const finishedReportedRef = useRef(false);
  const reportFinished = useCallback(() => {
    if (finishedReportedRef.current) return;
    finishedReportedRef.current = true;
    onFinished?.();
  }, [onFinished]);

  const baseOption = buildChartOption(config, result);
  // 印刷モードではアニメーションを無効化する（FEAT-BF-002）。
  // 描画は setOption の内部で同期的に完了する（完了通知は reportFinished を参照）。
  const option = printMode ? { ...baseOption, animation: false } : baseOption;

  // KPI カードは専用表示
  if (config.chartType === "kpi") {
    return <KpiCard title={title} result={result} fillContainer={isFillMode} />;
  }

  const tabIds = {
    chart: `chart-tab-${title.replace(/\s/g, "-")}`,
    table: `table-tab-${title.replace(/\s/g, "-")}`,
  };

  const chartTypeLabelText = chartTypeLabel(config.chartType, t);

  return (
    <section
      aria-label={title}
      className={[
        "flex flex-col gap-0 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/15 dark:bg-neutral-900",
        // FEAT-BF-005: フィルモードでは親コンテナの高さを 100% 埋める
        isFillMode ? "h-full" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* タブヘッダー（グラフ / テーブル） — フィルモードでは shrink-0 で高さを固定 */}
      <div
        role="tablist"
        aria-label={t("tabSwitchAriaLabel", { title })}
        className={[
          "flex border-b border-black/10 dark:border-white/15",
          isFillMode ? "shrink-0" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {config.chartType !== "table" && (
          <TabButton
            id={tabIds.chart}
            active={activeTab === "chart"}
            onClick={() => setActiveTab("chart")}
            label={t("chartTabLabel")}
            panelId={`${tabIds.chart}-panel`}
          />
        )}
        <TabButton
          id={tabIds.table}
          active={activeTab === "table"}
          onClick={() => setActiveTab("table")}
          label={t("tableTabLabel")}
          panelId={`${tabIds.table}-panel`}
        />
      </div>

      {/* グラフパネル */}
      {config.chartType !== "table" && (
        <div
          id={`${tabIds.chart}-panel`}
          role="tabpanel"
          aria-labelledby={tabIds.chart}
          hidden={activeTab !== "chart"}
          aria-label={t("chartPanelAriaLabel", {
            title,
            chartType: chartTypeLabelText,
          })}
          className={
            // FEAT-BF-005: フィルモードでは残り高さをすべて使う
            isFillMode ? "flex-1 min-h-0" : ""
          }
        >
          <ReactECharts
            ref={chartRef}
            option={option}
            style={
              isFillMode
                ? { height: "100%", width: "100%" }
                : { height: height ?? 280, width: "100%" }
            }
            opts={{ renderer: "svg" }}
            aria-label={t("chartAriaLabel", { title })}
            role="img"
            onEvents={
              onFinished
                ? ({ finished: reportFinished } as Record<string, () => void>)
                : undefined
            }
            // printMode では finished が購読前に発火済みのため、購読後に呼ばれるこの時点で通知する
            onChartReady={printMode && onFinished ? reportFinished : undefined}
          />
        </div>
      )}

      {/* データテーブルパネル */}
      <div
        id={`${tabIds.table}-panel`}
        role="tabpanel"
        aria-labelledby={tabIds.table}
        hidden={activeTab !== "table"}
        className={
          // FEAT-BF-005: フィルモードでは残り高さをすべて使い、縦スクロールを有効化
          isFillMode ? "flex-1 min-h-0 overflow-auto" : ""
        }
      >
        <DataTable title={title} result={result} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// KPI カード（専用表示）
// ─────────────────────────────────────────────

function KpiCard({
  title,
  result,
  fillContainer = false,
}: {
  title: string;
  result: QueryResult;
  /** FEAT-BF-005: true のとき親コンテナの高さを 100% 埋める */
  fillContainer?: boolean;
}) {
  const locale = useLocale() as AppLocale;
  const firstName = result.measureNames[0];
  const firstRow = result.rows[0];
  const value =
    firstName && firstRow ? (firstRow.values[firstName] ?? null) : null;
  const formatted = value !== null ? formatNumber(Number(value), locale) : "—";

  return (
    <section
      aria-label={`${title} KPI`}
      className={[
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-neutral-900",
        fillContainer ? "h-full" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className="text-sm font-medium text-black/60 dark:text-white/60"
        aria-hidden="true"
      >
        {title}
      </span>
      <span
        className="text-5xl font-bold tabular-nums"
        aria-label={`${title}: ${formatted}`}
      >
        {formatted}
      </span>
      {firstName && (
        <span className="text-xs text-black/40 dark:text-white/60">
          {firstName}
        </span>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// データテーブル（FEAT-010 アクセシビリティ対応）
// ─────────────────────────────────────────────

function DataTable({ title, result }: { title: string; result: QueryResult }) {
  const t = useTranslations("chartWidget");
  const locale = useLocale() as AppLocale;

  const handleCopy = useCallback(async () => {
    if (result.rows.length === 0) return;
    const header = [
      result.groupByColumn ?? t("rowFallbackLabel"),
      ...result.measureNames,
    ].join("\t");
    const body = result.rows
      .map((r) =>
        [r.key, ...result.measureNames.map((n) => r.values[n] ?? "")].join(
          "\t",
        ),
      )
      .join("\n");
    await navigator.clipboard.writeText(`${header}\n${body}`);
  }, [result, t]);

  if (result.rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center p-6 text-sm text-black/40 dark:text-white/60"
        role="status"
        aria-live="polite"
      >
        {t("noDataMessage")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-black/50 dark:text-white/50">
          {t("countLabel", { count: result.rows.length })}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded border border-black/10 px-2 py-1 text-xs transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
          aria-label={t("copyButtonAriaLabel", { title })}
        >
          {t("copyButton")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-xs"
          aria-label={t("tableAriaLabel", { title })}
        >
          <thead>
            <tr className="border-b border-black/10 dark:border-white/15">
              <th
                scope="col"
                className="px-2 py-1.5 text-left font-medium text-black/60 dark:text-white/60"
              >
                {result.groupByColumn ?? t("rowFallbackLabel")}
              </th>
              {result.measureNames.map((name) => (
                <th
                  key={name}
                  scope="col"
                  className="px-2 py-1.5 text-right font-medium text-black/60 dark:text-white/60"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-black/[.05] last:border-0 hover:bg-black/[.02] dark:border-white/[.05] dark:hover:bg-white/[.02]"
              >
                <td className="px-2 py-1.5">{row.key}</td>
                {result.measureNames.map((name) => (
                  <td
                    key={name}
                    className="px-2 py-1.5 text-right tabular-nums"
                  >
                    {row.values[name] !== null && row.values[name] !== undefined
                      ? formatNumber(Number(row.values[name]), locale)
                      : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// タブボタン
// ─────────────────────────────────────────────

function TabButton({
  id,
  active,
  onClick,
  label,
  panelId,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  label: string;
  panelId: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        "px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-b-2 border-black text-black dark:border-white dark:text-white"
          : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// グラフ種別ラベル取得
// ─────────────────────────────────────────────

function chartTypeLabel(
  type: string,
  t: ReturnType<typeof useTranslations<"chartWidget">>,
): string {
  const key = `chartTypeLabels.${type}` as Parameters<typeof t>[0];
  try {
    return t(key);
  } catch {
    return type;
  }
}

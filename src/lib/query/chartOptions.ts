/**
 * ECharts option オブジェクト生成ロジック（FEAT-009 / Sprint 6）。
 *
 * - `server-only` / React に依存しない純粋関数。Vitest から直接テスト可能。
 * - SVG レンダラ用の option を返す（CLAUDE.md "ECharts の SVG レンダラを使用"）。
 * - `any` 不使用。ECharts の型（`EChartsCoreOption`）を使う。
 */

import type { EChartsCoreOption } from "echarts/core";
import type { WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

/** デフォルトカラーパレット（ECharts デフォルト準拠 + アクセシビリティ配慮） */
const DEFAULT_PALETTE = [
  "#5470c6",
  "#91cc75",
  "#fac858",
  "#ee6666",
  "#73c0de",
  "#3ba272",
  "#fc8452",
  "#9a60b4",
  "#ea7ccc",
];

/**
 * `WidgetConfig` と `QueryResult` から ECharts の option を生成する。
 *
 * @param config - `Widget.config`（Zod パース済み）
 * @param result - `applyQuery()` の結果
 * @returns ECharts に渡す option オブジェクト
 */
export function buildChartOption(
  config: WidgetConfig,
  result: QueryResult,
): EChartsCoreOption {
  const palette = config.colorPalette ?? DEFAULT_PALETTE;

  switch (config.chartType) {
    case "bar":
      return buildBarOption(config, result, palette, false);
    case "line":
      return buildLineOption(config, result, palette);
    case "area":
      return buildAreaOption(config, result, palette);
    case "pie":
      return buildPieOption(config, result, palette, false);
    case "donut":
      return buildPieOption(config, result, palette, true);
    case "scatter":
      return buildScatterOption(config, result, palette);
    case "radar":
      return buildRadarOption(config, result, palette);
    case "funnel":
      return buildFunnelOption(config, result, palette);
    case "treemap":
      return buildTreemapOption(config, result, palette);
    case "gauge":
      return buildGaugeOption(result);
    case "kpi":
      return buildKpiOption(result);
    case "heatmap":
      return buildHeatmapOption(config, result);
    case "bubble":
      return buildBubbleOption(config, result, palette);
    case "table":
      // テーブルモードはグラフ不要（データテーブルのみ表示）
      return {};
    default:
      return buildBarOption(config, result, palette, false);
  }
}

// ─────────────────────────────────────────────
// 棒グラフ（縦）
// ─────────────────────────────────────────────

function buildBarOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
  horizontal: boolean,
): EChartsCoreOption {
  const series = result.measureNames.map((name, i) => ({
    name,
    type: "bar" as const,
    data: result.rows.map((r) => r.values[name] ?? null),
    label: {
      show: config.showLabels,
      position: horizontal ? ("right" as const) : ("top" as const),
    },
    itemStyle: { color: palette[i % palette.length] },
  }));

  if (horizontal) {
    return {
      color: palette,
      tooltip: { trigger: "axis" as const },
      legend: config.showLegend
        ? { show: true, type: "scroll" as const }
        : { show: false },
      grid: { containLabel: true },
      xAxis: { type: "value" as const },
      yAxis: {
        type: "category" as const,
        data: result.categories,
      },
      series,
    };
  }

  return {
    color: palette,
    tooltip: { trigger: "axis" as const },
    legend: config.showLegend
      ? { show: true, type: "scroll" as const }
      : { show: false },
    grid: { containLabel: true },
    xAxis: {
      type: "category" as const,
      data: result.categories,
    },
    yAxis: { type: "value" as const },
    series,
  };
}

// ─────────────────────────────────────────────
// 折れ線グラフ
// ─────────────────────────────────────────────

function buildLineOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  const series = result.measureNames.map((name, i) => ({
    name,
    type: "line" as const,
    data: result.rows.map((r) => r.values[name] ?? null),
    label: { show: config.showLabels },
    itemStyle: { color: palette[i % palette.length] },
  }));

  return {
    color: palette,
    tooltip: { trigger: "axis" as const },
    legend: config.showLegend
      ? { show: true, type: "scroll" as const }
      : { show: false },
    grid: { containLabel: true },
    xAxis: { type: "category" as const, data: result.categories },
    yAxis: { type: "value" as const },
    series,
  };
}

// ─────────────────────────────────────────────
// 面グラフ
// ─────────────────────────────────────────────

function buildAreaOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  const series = result.measureNames.map((name, i) => ({
    name,
    type: "line" as const,
    areaStyle: {},
    data: result.rows.map((r) => r.values[name] ?? null),
    label: { show: config.showLabels },
    itemStyle: { color: palette[i % palette.length] },
  }));

  return {
    color: palette,
    tooltip: { trigger: "axis" as const },
    legend: config.showLegend
      ? { show: true, type: "scroll" as const }
      : { show: false },
    grid: { containLabel: true },
    xAxis: { type: "category" as const, data: result.categories },
    yAxis: { type: "value" as const },
    series,
  };
}

// ─────────────────────────────────────────────
// 円グラフ / ドーナツグラフ
// ─────────────────────────────────────────────

function buildPieOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
  donut: boolean,
): EChartsCoreOption {
  const firstName = result.measureNames[0];
  const data = result.categories.map((cat, i) => ({
    name: cat,
    value: firstName ? (result.rows[i]?.values[firstName] ?? null) : null,
  }));

  return {
    color: palette,
    tooltip: { trigger: "item" as const },
    legend: config.showLegend
      ? { show: true, type: "scroll" as const, orient: "vertical" as const }
      : { show: false },
    series: [
      {
        type: "pie" as const,
        radius: donut ? ["40%", "70%"] : "70%",
        data,
        label: { show: config.showLabels },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// 散布図
// ─────────────────────────────────────────────

function buildScatterOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  // xAxisColumn / yAxisColumn から散布図データを組み立てる
  const xName = config.xAxisColumn ?? result.measureNames[0];
  const yName =
    config.yAxisColumn ?? result.measureNames[1] ?? result.measureNames[0];

  const data = result.rows.map((r) => [
    r.values[xName ?? ""] ?? null,
    r.values[yName ?? ""] ?? null,
  ]);

  return {
    color: palette,
    tooltip: { trigger: "item" as const },
    legend: config.showLegend
      ? { show: true, type: "scroll" as const }
      : { show: false },
    grid: { containLabel: true },
    xAxis: { type: "value" as const, name: xName },
    yAxis: { type: "value" as const, name: yName },
    series: [
      {
        type: "scatter" as const,
        data,
        label: { show: config.showLabels },
        itemStyle: { color: palette[0] },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// バブルチャート
// ─────────────────────────────────────────────

function buildBubbleOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  const xName = config.xAxisColumn ?? result.measureNames[0];
  const yName =
    config.yAxisColumn ?? result.measureNames[1] ?? result.measureNames[0];
  const sizeName = result.measureNames[2] ?? result.measureNames[0];

  const data = result.rows.map((r) => [
    r.values[xName ?? ""] ?? null,
    r.values[yName ?? ""] ?? null,
    r.values[sizeName ?? ""] ?? null,
  ]);

  return {
    color: palette,
    tooltip: { trigger: "item" as const },
    grid: { containLabel: true },
    xAxis: { type: "value" as const, name: xName },
    yAxis: { type: "value" as const, name: yName },
    series: [
      {
        type: "scatter" as const,
        data,
        symbolSize: (val: (number | null)[]) => {
          const size = val[2];
          if (size === null || size === undefined) return 10;
          return Math.max(5, Math.min(50, Math.sqrt(Math.abs(size)) * 2));
        },
        label: { show: config.showLabels },
        itemStyle: { color: palette[0] },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// レーダーチャート
// ─────────────────────────────────────────────

function buildRadarOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  const indicators = result.categories.map((cat) => ({
    name: cat,
    max: undefined,
  }));
  const firstName = result.measureNames[0];

  const seriesData = result.measureNames.map((name) => ({
    name,
    value: result.rows.map((r) => r.values[name] ?? 0),
  }));

  // カテゴリごとのデータを1系列として表示（categories が指標名になる）
  const singleData = {
    name: firstName ?? "",
    value: result.categories.map((_, i) => {
      const row = result.rows[i];
      return firstName && row ? (row.values[firstName] ?? 0) : 0;
    }),
  };

  return {
    color: palette,
    tooltip: {},
    legend: config.showLegend
      ? { show: true, data: result.measureNames }
      : { show: false },
    radar: { indicator: indicators },
    series: [
      {
        type: "radar" as const,
        data: result.measureNames.length > 1 ? seriesData : [singleData],
        label: { show: config.showLabels },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// ファネル
// ─────────────────────────────────────────────

function buildFunnelOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  const firstName = result.measureNames[0];
  const data = result.categories.map((cat, i) => ({
    name: cat,
    value: firstName ? (result.rows[i]?.values[firstName] ?? 0) : 0,
  }));

  return {
    color: palette,
    tooltip: { trigger: "item" as const },
    legend: config.showLegend
      ? { show: true, type: "scroll" as const }
      : { show: false },
    series: [
      {
        type: "funnel" as const,
        data,
        label: { show: config.showLabels },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// ツリーマップ
// ─────────────────────────────────────────────

function buildTreemapOption(
  config: WidgetConfig,
  result: QueryResult,
  palette: string[],
): EChartsCoreOption {
  const firstName = result.measureNames[0];
  const data = result.categories.map((cat, i) => ({
    name: cat,
    value: firstName ? (result.rows[i]?.values[firstName] ?? 0) : 0,
  }));

  return {
    color: palette,
    tooltip: { trigger: "item" as const },
    series: [
      {
        type: "treemap" as const,
        data,
        label: { show: config.showLabels },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// ゲージ
// ─────────────────────────────────────────────

function buildGaugeOption(result: QueryResult): EChartsCoreOption {
  const firstName = result.measureNames[0];
  const firstRow = result.rows[0];
  const value = firstName && firstRow ? (firstRow.values[firstName] ?? 0) : 0;

  return {
    series: [
      {
        type: "gauge" as const,
        data: [{ value: Number(value), name: firstName ?? "" }],
        detail: { formatter: "{value}" },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// KPI カード（グラフ不要 - 数値表示のみ）
// ─────────────────────────────────────────────

function buildKpiOption(result: QueryResult): EChartsCoreOption {
  // KPI はグラフなし（コンポーネント側で数値表示する）
  const firstName = result.measureNames[0];
  const firstRow = result.rows[0];
  const value =
    firstName && firstRow ? (firstRow.values[firstName] ?? null) : null;

  return {
    graphic: [
      {
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: value !== null ? String(value) : "—",
          fontSize: 48,
          fontWeight: "bold",
          fill: "#333",
          textAlign: "center",
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// ヒートマップ
// ─────────────────────────────────────────────

function buildHeatmapOption(
  config: WidgetConfig,
  result: QueryResult,
): EChartsCoreOption {
  // ヒートマップ: xAxisColumn と yAxisColumn が設定されていることを前提とする
  // queryResult の rows をそのまま data に変換
  const firstName = result.measureNames[0];
  const data = result.rows.map((r, i) => [
    i, // x 軸インデックス
    0, // y 軸（単純化: 1行ヒートマップ）
    r.values[firstName ?? ""] ?? 0,
  ]);

  return {
    tooltip: { position: "top" as const },
    grid: { containLabel: true },
    xAxis: {
      type: "category" as const,
      data: result.categories,
    },
    yAxis: {
      type: "category" as const,
      data: [firstName ?? "value"],
    },
    visualMap: {
      min: 0,
      max: Math.max(
        ...result.rows.map((r) => Number(r.values[firstName ?? ""] ?? 0)),
      ),
      calculable: true,
      orient: "horizontal" as const,
      left: "center" as const,
    },
    series: [
      {
        type: "heatmap" as const,
        data,
        label: { show: config.showLabels },
      },
    ],
  };
}

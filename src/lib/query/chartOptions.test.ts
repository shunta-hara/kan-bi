import { describe, it, expect } from "vitest";
import { buildChartOption } from "@/lib/query/chartOptions";
import type { WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

// ─────────────────────────────────────────────
// テストデータ
// ─────────────────────────────────────────────

const baseConfig: WidgetConfig = {
  chartType: "bar",
  showLegend: true,
  showLabels: false,
  schemaVersion: 1,
};

const baseResult: QueryResult = {
  groupByColumn: "category",
  categories: ["A", "B", "C"],
  rows: [
    { key: "A", values: { sales_sum: 100 } },
    { key: "B", values: { sales_sum: 200 } },
    { key: "C", values: { sales_sum: 300 } },
  ],
  measureNames: ["sales_sum"],
};

const emptyResult: QueryResult = {
  groupByColumn: undefined,
  categories: [],
  rows: [],
  measureNames: [],
};

// ─────────────────────────────────────────────
// 棒グラフ
// ─────────────────────────────────────────────

describe("buildChartOption - bar", () => {
  it("正常系: bar option に xAxis.data が categories と一致する", () => {
    const option = buildChartOption(baseConfig, baseResult);
    const xAxis = option.xAxis as { data: string[] };
    expect(xAxis.data).toEqual(["A", "B", "C"]);
  });

  it("正常系: series[0].data が各行の値と一致する", () => {
    const option = buildChartOption(baseConfig, baseResult);
    const series = option.series as { data: (number | null)[] }[];
    expect(series[0]?.data).toEqual([100, 200, 300]);
  });

  it("正常系: showLegend=true のとき legend.show=true", () => {
    const option = buildChartOption(baseConfig, baseResult);
    const legend = option.legend as { show: boolean };
    expect(legend.show).toBe(true);
  });

  it("正常系: showLegend=false のとき legend.show=false", () => {
    const config: WidgetConfig = { ...baseConfig, showLegend: false };
    const option = buildChartOption(config, baseResult);
    const legend = option.legend as { show: boolean };
    expect(legend.show).toBe(false);
  });

  it("正常系: showLabels=true のとき series[0].label.show=true", () => {
    const config: WidgetConfig = { ...baseConfig, showLabels: true };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { label: { show: boolean } }[];
    expect(series[0]?.label.show).toBe(true);
  });

  it("正常系: 空データでも option を生成できる", () => {
    const option = buildChartOption(baseConfig, emptyResult);
    expect(option).toBeDefined();
    // measureNames が空のとき series は空配列になる
    const series = option.series as { data: unknown[] }[];
    expect(series).toHaveLength(0);
  });

  it("正常系: colorPalette が config に設定されていれば color に使われる", () => {
    const config: WidgetConfig = {
      ...baseConfig,
      colorPalette: ["#ff0000", "#00ff00"],
    };
    const option = buildChartOption(config, baseResult);
    const colors = option.color as string[];
    expect(colors[0]).toBe("#ff0000");
  });
});

// ─────────────────────────────────────────────
// 折れ線グラフ
// ─────────────────────────────────────────────

describe("buildChartOption - line", () => {
  it("正常系: series[0].type が 'line'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "line" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { type: string }[];
    expect(series[0]?.type).toBe("line");
  });
});

// ─────────────────────────────────────────────
// 面グラフ
// ─────────────────────────────────────────────

describe("buildChartOption - area", () => {
  it("正常系: series[0].areaStyle が設定されている", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "area" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { areaStyle: unknown }[];
    expect(series[0]?.areaStyle).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// 円グラフ
// ─────────────────────────────────────────────

describe("buildChartOption - pie", () => {
  it("正常系: series[0].type が 'pie'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "pie" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { type: string }[];
    expect(series[0]?.type).toBe("pie");
  });

  it("正常系: series[0].data の name が categories と一致する", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "pie" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as {
      data: { name: string; value: number | null }[];
    }[];
    expect(series[0]?.data.map((d) => d.name)).toEqual(["A", "B", "C"]);
  });
});

// ─────────────────────────────────────────────
// ドーナツグラフ
// ─────────────────────────────────────────────

describe("buildChartOption - donut", () => {
  it("正常系: series[0].radius が配列（ドーナツ形状）", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "donut" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { radius: unknown }[];
    expect(Array.isArray(series[0]?.radius)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 散布図
// ─────────────────────────────────────────────

describe("buildChartOption - scatter", () => {
  it("正常系: series[0].type が 'scatter'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "scatter" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { type: string }[];
    expect(series[0]?.type).toBe("scatter");
  });
});

// ─────────────────────────────────────────────
// レーダーチャート
// ─────────────────────────────────────────────

describe("buildChartOption - radar", () => {
  it("正常系: series[0].type が 'radar'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "radar" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { type: string }[];
    expect(series[0]?.type).toBe("radar");
  });

  it("正常系: radar.indicator が categories の数と一致する", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "radar" };
    const option = buildChartOption(config, baseResult);
    const radar = option.radar as { indicator: unknown[] };
    expect(radar.indicator).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────
// ファネル
// ─────────────────────────────────────────────

describe("buildChartOption - funnel", () => {
  it("正常系: series[0].type が 'funnel'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "funnel" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { type: string }[];
    expect(series[0]?.type).toBe("funnel");
  });
});

// ─────────────────────────────────────────────
// ツリーマップ
// ─────────────────────────────────────────────

describe("buildChartOption - treemap", () => {
  it("正常系: series[0].type が 'treemap'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "treemap" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as { type: string }[];
    expect(series[0]?.type).toBe("treemap");
  });
});

// ─────────────────────────────────────────────
// ゲージ
// ─────────────────────────────────────────────

describe("buildChartOption - gauge", () => {
  it("正常系: series[0].type が 'gauge'", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "gauge" };
    const option = buildChartOption(config, baseResult);
    const series = option.series as {
      type: string;
      data: { value: number }[];
    }[];
    expect(series[0]?.type).toBe("gauge");
  });

  it("正常系: データがない場合は value=0 を返す", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "gauge" };
    const option = buildChartOption(config, emptyResult);
    const series = option.series as { data: { value: number }[] }[];
    expect(series[0]?.data[0]?.value).toBe(0);
  });
});

// ─────────────────────────────────────────────
// KPI カード
// ─────────────────────────────────────────────

describe("buildChartOption - kpi", () => {
  it("正常系: graphic[0].style.text に最初の値が入る", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "kpi" };
    const option = buildChartOption(config, baseResult);
    const graphic = option.graphic as { style: { text: string } }[];
    expect(graphic[0]?.style.text).toBe("100");
  });

  it("正常系: データがない場合は '—' を表示", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "kpi" };
    const option = buildChartOption(config, emptyResult);
    const graphic = option.graphic as { style: { text: string } }[];
    expect(graphic[0]?.style.text).toBe("—");
  });
});

// ─────────────────────────────────────────────
// テーブル（グラフなし）
// ─────────────────────────────────────────────

describe("buildChartOption - table", () => {
  it("正常系: table 種別は空の option オブジェクトを返す", () => {
    const config: WidgetConfig = { ...baseConfig, chartType: "table" };
    const option = buildChartOption(config, baseResult);
    expect(option).toEqual({});
  });
});

// ─────────────────────────────────────────────
// 境界値・異常系
// ─────────────────────────────────────────────

describe("buildChartOption - 境界値・異常系", () => {
  it("境界値: measureNames が空でも bar option を生成できる", () => {
    const result: QueryResult = {
      ...baseResult,
      measureNames: [],
      rows: baseResult.rows.map((r) => ({ ...r, values: {} })),
    };
    const option = buildChartOption(baseConfig, result);
    expect(option).toBeDefined();
    const series = option.series as unknown[];
    expect(series).toHaveLength(0);
  });

  it("境界値: 行数が 1 件でも描画できる", () => {
    const result: QueryResult = {
      groupByColumn: "category",
      categories: ["A"],
      rows: [{ key: "A", values: { sales_sum: 999 } }],
      measureNames: ["sales_sum"],
    };
    const option = buildChartOption(baseConfig, result);
    const series = option.series as { data: (number | null)[] }[];
    expect(series[0]?.data).toEqual([999]);
  });

  it("異常系: values に null が含まれても option を生成できる", () => {
    const result: QueryResult = {
      groupByColumn: "category",
      categories: ["A", "B"],
      rows: [
        { key: "A", values: { sales_sum: null } },
        { key: "B", values: { sales_sum: 200 } },
      ],
      measureNames: ["sales_sum"],
    };
    const option = buildChartOption(baseConfig, result);
    const series = option.series as { data: (number | null)[] }[];
    expect(series[0]?.data).toEqual([null, 200]);
  });
});

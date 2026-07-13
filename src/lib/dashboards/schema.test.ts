import { describe, it, expect } from "vitest";

import {
  createDashboardInputSchema,
  updateDashboardInputSchema,
  createWidgetInputSchema,
  updateWidgetInputSchema,
  widgetQuerySchema,
  widgetConfigSchema,
  dashboardLayoutsSchema,
  parseDashboardLayouts,
  parseWidgetQuery,
  parseWidgetConfig,
  widgetChartTypeSchema,
} from "@/lib/dashboards/schema";

// ─────────────────────────────────────────────
// createDashboardInputSchema
// ─────────────────────────────────────────────

describe("createDashboardInputSchema", () => {
  it("正常系: title のみで作成できる", () => {
    const result = createDashboardInputSchema.safeParse({
      title: "売上ダッシュボード",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("売上ダッシュボード");
      expect(result.data.description).toBeUndefined();
    }
  });

  it("正常系: title + description で作成できる", () => {
    const result = createDashboardInputSchema.safeParse({
      title: "売上ダッシュボード",
      description: "月次売上の推移を可視化",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("月次売上の推移を可視化");
    }
  });

  it("正常系: title が前後空白を持つ場合はトリムされる", () => {
    const result = createDashboardInputSchema.safeParse({ title: "  売上  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("売上");
    }
  });

  it("異常系: title が空文字は拒否される", () => {
    const result = createDashboardInputSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("異常系: title が未指定は拒否される", () => {
    const result = createDashboardInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("境界値: title が 120 文字ちょうどは通る", () => {
    const result = createDashboardInputSchema.safeParse({
      title: "a".repeat(120),
    });
    expect(result.success).toBe(true);
  });

  it("境界値: title が 121 文字は拒否される", () => {
    const result = createDashboardInputSchema.safeParse({
      title: "a".repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it("境界値: description が 500 文字ちょうどは通る", () => {
    const result = createDashboardInputSchema.safeParse({
      title: "テスト",
      description: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("境界値: description が 501 文字は拒否される", () => {
    const result = createDashboardInputSchema.safeParse({
      title: "テスト",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// updateDashboardInputSchema
// ─────────────────────────────────────────────

describe("updateDashboardInputSchema", () => {
  it("正常系: title のみの更新", () => {
    const result = updateDashboardInputSchema.safeParse({
      title: "新タイトル",
    });
    expect(result.success).toBe(true);
  });

  it("正常系: description のみの更新", () => {
    const result = updateDashboardInputSchema.safeParse({
      description: "新しい説明",
    });
    expect(result.success).toBe(true);
  });

  it("正常系: description を undefined にして更新（省略）", () => {
    const result = updateDashboardInputSchema.safeParse({ title: "タイトル" });
    expect(result.success).toBe(true);
  });

  it("異常系: 空オブジェクトは少なくとも1フィールドが必要で拒否される", () => {
    const result = updateDashboardInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// widgetQuerySchema
// ─────────────────────────────────────────────

describe("widgetQuerySchema", () => {
  it("正常系: 空のクエリ（デフォルト値）", () => {
    const result = widgetQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.measures).toEqual([]);
      expect(result.data.filters).toEqual([]);
      expect(result.data.sorts).toEqual([]);
    }
  });

  it("正常系: グルーピング + 集計値 + 並び替えあり", () => {
    const result = widgetQuerySchema.safeParse({
      groupByColumn: "month",
      measures: [{ column: "sales", function: "sum", alias: "総売上" }],
      sorts: [{ column: "month", order: "asc" }],
      limit: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.groupByColumn).toBe("month");
      expect(result.data.measures[0]?.function).toBe("sum");
    }
  });

  it("正常系: フィルタ条件（isNull/isNotNull は value 不要）", () => {
    const result = widgetQuerySchema.safeParse({
      filters: [{ column: "category", operator: "isNull" }],
    });
    expect(result.success).toBe(true);
  });

  it("異常系: 無効な aggregateFunction は拒否される", () => {
    const result = widgetQuerySchema.safeParse({
      measures: [{ column: "sales", function: "invalid_func" }],
    });
    expect(result.success).toBe(false);
  });

  it("境界値: limit = 1 は通る", () => {
    const result = widgetQuerySchema.safeParse({ limit: 1 });
    expect(result.success).toBe(true);
  });

  it("境界値: limit = 10000 は通る", () => {
    const result = widgetQuerySchema.safeParse({ limit: 10_000 });
    expect(result.success).toBe(true);
  });

  it("境界値: limit = 10001 は拒否される", () => {
    const result = widgetQuerySchema.safeParse({ limit: 10_001 });
    expect(result.success).toBe(false);
  });

  it("境界値: limit = 0 は拒否される", () => {
    const result = widgetQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// widgetConfigSchema
// ─────────────────────────────────────────────

describe("widgetConfigSchema", () => {
  it("正常系: 最小限（chartType のみ）", () => {
    const result = widgetConfigSchema.safeParse({ chartType: "bar" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showLegend).toBe(true);
      expect(result.data.showLabels).toBe(false);
      expect(result.data.schemaVersion).toBe(1);
    }
  });

  it("正常系: 全フィールド指定", () => {
    const result = widgetConfigSchema.safeParse({
      chartType: "line",
      xAxisColumn: "month",
      yAxisColumn: "sales",
      showLegend: false,
      showLabels: true,
      colorPalette: ["#ff0000", "#00ff00"],
      schemaVersion: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chartType).toBe("line");
      expect(result.data.showLegend).toBe(false);
    }
  });

  it("異常系: 無効な chartType は拒否される", () => {
    const result = widgetConfigSchema.safeParse({ chartType: "unknown_chart" });
    expect(result.success).toBe(false);
  });

  it("異常系: chartType 未指定は拒否される", () => {
    const result = widgetConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("正常系: すべての有効な chartType が通る", () => {
    const types = [
      "bar",
      "line",
      "area",
      "pie",
      "donut",
      "scatter",
      "bubble",
      "radar",
      "heatmap",
      "gauge",
      "treemap",
      "funnel",
      "kpi",
      "table",
    ] as const;
    for (const type of types) {
      const result = widgetChartTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────
// createWidgetInputSchema
// ─────────────────────────────────────────────

describe("createWidgetInputSchema", () => {
  it("正常系: 必須項目のみ", () => {
    const result = createWidgetInputSchema.safeParse({
      type: "bar",
      config: { chartType: "bar" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("bar");
      expect(result.data.query.measures).toEqual([]);
    }
  });

  it("正常系: dataSourceId + title 付き", () => {
    const result = createWidgetInputSchema.safeParse({
      type: "line",
      title: "売上推移",
      dataSourceId: "ds_abc123",
      config: { chartType: "line" },
    });
    expect(result.success).toBe(true);
  });

  it("異常系: type 未指定は拒否される", () => {
    const result = createWidgetInputSchema.safeParse({
      config: { chartType: "bar" },
    });
    expect(result.success).toBe(false);
  });

  it("異常系: config 未指定は拒否される", () => {
    const result = createWidgetInputSchema.safeParse({ type: "bar" });
    expect(result.success).toBe(false);
  });

  it("境界値: title が 120 文字ちょうどは通る", () => {
    const result = createWidgetInputSchema.safeParse({
      type: "bar",
      title: "a".repeat(120),
      config: { chartType: "bar" },
    });
    expect(result.success).toBe(true);
  });

  it("境界値: title が 121 文字は拒否される", () => {
    const result = createWidgetInputSchema.safeParse({
      type: "bar",
      title: "a".repeat(121),
      config: { chartType: "bar" },
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// updateWidgetInputSchema
// ─────────────────────────────────────────────

describe("updateWidgetInputSchema", () => {
  it("正常系: config のみの更新", () => {
    const result = updateWidgetInputSchema.safeParse({
      config: { chartType: "pie" },
    });
    expect(result.success).toBe(true);
  });

  it("正常系: dataSourceId を null にする（参照解除）", () => {
    const result = updateWidgetInputSchema.safeParse({ dataSourceId: null });
    expect(result.success).toBe(true);
  });

  it("正常系: query + config の同時更新（WidgetEditDialog の保存フロー相当）", () => {
    const result = updateWidgetInputSchema.safeParse({
      dataSourceId: "ds_abc",
      query: {
        groupByColumn: "month",
        measures: [{ column: "sales", function: "sum" }],
        filters: [],
        sorts: [],
      },
      config: {
        chartType: "bar",
        xAxisColumn: "month",
        yAxisColumn: "sales",
        showLegend: true,
        showLabels: false,
        schemaVersion: 1,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query?.groupByColumn).toBe("month");
      expect(result.data.config?.chartType).toBe("bar");
    }
  });

  it("正常系: title のみの更新", () => {
    const result = updateWidgetInputSchema.safeParse({ title: "新タイトル" });
    expect(result.success).toBe(true);
  });

  it("正常系: dataSourceId を文字列 ID で設定", () => {
    const result = updateWidgetInputSchema.safeParse({
      dataSourceId: "ds_xyz",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dataSourceId).toBe("ds_xyz");
    }
  });

  it("異常系: 空オブジェクトは少なくとも1フィールドが必要で拒否される", () => {
    const result = updateWidgetInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("異常系: config に無効な chartType を含む場合は拒否される", () => {
    const result = updateWidgetInputSchema.safeParse({
      config: { chartType: "unknown_type" },
    });
    expect(result.success).toBe(false);
  });

  it("境界値: title が 120 文字ちょうどは通る", () => {
    const result = updateWidgetInputSchema.safeParse({
      title: "a".repeat(120),
    });
    expect(result.success).toBe(true);
  });

  it("境界値: title が 121 文字は拒否される", () => {
    const result = updateWidgetInputSchema.safeParse({
      title: "a".repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it("境界値: query.limit = 10000 は通る", () => {
    const result = updateWidgetInputSchema.safeParse({
      query: { measures: [], filters: [], sorts: [], limit: 10_000 },
    });
    expect(result.success).toBe(true);
  });

  it("境界値: query.limit = 10001 は拒否される", () => {
    const result = updateWidgetInputSchema.safeParse({
      query: { measures: [], filters: [], sorts: [], limit: 10_001 },
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// dashboardLayoutsSchema
// ─────────────────────────────────────────────

describe("dashboardLayoutsSchema", () => {
  it("正常系: 空オブジェクト", () => {
    const result = dashboardLayoutsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("正常系: 有効なレイアウトアイテム", () => {
    const result = dashboardLayoutsSchema.safeParse({
      lg: [{ i: "widget-1", x: 0, y: 0, w: 6, h: 4 }],
      md: [{ i: "widget-1", x: 0, y: 0, w: 12, h: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it("異常系: i が空文字は拒否される", () => {
    const result = dashboardLayoutsSchema.safeParse({
      lg: [{ i: "", x: 0, y: 0, w: 6, h: 4 }],
    });
    expect(result.success).toBe(false);
  });

  it("異常系: w = 0 は拒否される（min 1）", () => {
    const result = dashboardLayoutsSchema.safeParse({
      lg: [{ i: "w1", x: 0, y: 0, w: 0, h: 4 }],
    });
    expect(result.success).toBe(false);
  });

  it("異常系: x が負数は拒否される", () => {
    const result = dashboardLayoutsSchema.safeParse({
      lg: [{ i: "w1", x: -1, y: 0, w: 6, h: 4 }],
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// parseDashboardLayouts（安全パース関数）
// ─────────────────────────────────────────────

describe("parseDashboardLayouts", () => {
  it("正常系: 有効なレイアウトをパースする", () => {
    const layouts = parseDashboardLayouts({
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    });
    expect(layouts.lg?.[0]?.i).toBe("w1");
  });

  it("異常系: null は空オブジェクトを返す", () => {
    expect(parseDashboardLayouts(null)).toEqual({});
  });

  it("異常系: undefined は空オブジェクトを返す", () => {
    expect(parseDashboardLayouts(undefined)).toEqual({});
  });

  it("異常系: 不正なオブジェクトは空オブジェクトを返す（壊れた DB データ）", () => {
    expect(parseDashboardLayouts({ lg: "not-an-array" })).toEqual({});
  });

  it("異常系: 文字列は空オブジェクトを返す", () => {
    expect(parseDashboardLayouts("invalid")).toEqual({});
  });
});

// ─────────────────────────────────────────────
// parseWidgetQuery（安全パース関数）
// ─────────────────────────────────────────────

describe("parseWidgetQuery", () => {
  it("正常系: 有効なクエリをパースする", () => {
    const query = parseWidgetQuery({
      groupByColumn: "month",
      measures: [{ column: "sales", function: "sum" }],
      filters: [],
      sorts: [],
    });
    expect(query.groupByColumn).toBe("month");
    expect(query.measures[0]?.function).toBe("sum");
  });

  it("異常系: null はデフォルトクエリを返す", () => {
    const query = parseWidgetQuery(null);
    expect(query.measures).toEqual([]);
    expect(query.filters).toEqual([]);
    expect(query.sorts).toEqual([]);
  });

  it("異常系: undefined はデフォルトクエリを返す", () => {
    const query = parseWidgetQuery(undefined);
    expect(query.measures).toEqual([]);
  });

  it("異常系: 不正な値はデフォルトクエリを返す", () => {
    const query = parseWidgetQuery({ measures: "invalid" });
    expect(query.measures).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// parseWidgetConfig（安全パース関数）
// ─────────────────────────────────────────────

describe("parseWidgetConfig", () => {
  it("正常系: 有効な config をパースする", () => {
    const config = parseWidgetConfig({
      chartType: "line",
      showLegend: false,
      showLabels: true,
      schemaVersion: 1,
    });
    expect(config.chartType).toBe("line");
    expect(config.showLegend).toBe(false);
  });

  it("異常系: null はデフォルト config（bar）を返す", () => {
    const config = parseWidgetConfig(null);
    expect(config.chartType).toBe("bar");
    expect(config.showLegend).toBe(true);
    expect(config.schemaVersion).toBe(1);
  });

  it("異常系: undefined はデフォルト config を返す", () => {
    const config = parseWidgetConfig(undefined);
    expect(config.chartType).toBe("bar");
  });

  it("異常系: 無効な chartType を持つ config はデフォルトを返す", () => {
    const config = parseWidgetConfig({ chartType: "unknown" });
    expect(config.chartType).toBe("bar");
  });
});

import { z } from "zod";

/**
 * ダッシュボード・ウィジェット関連の Zod スキーマ集約モジュール（Sprint 5 / FEAT-007, FEAT-008）。
 *
 * - `server-only` / `prisma` クライアントに依存しないため、ユニットテストから安全に import できる。
 * - DB 境界で `Json` 型として永続化される `layouts` / `query` / `config` は、
 *   必ずこのモジュールのスキーマでパースしてから扱う（rules/typescript.md）。
 */

// ─────────────────────────────────────────────
// ダッシュボード入力スキーマ
// ─────────────────────────────────────────────

export const dashboardTitleSchema = z
  .string()
  .trim()
  .min(1, { message: "title is required" })
  .max(120, { message: "title is too long" });

export const dashboardDescriptionSchema = z
  .string()
  .trim()
  .max(500, { message: "description is too long" })
  .optional();

/**
 * `POST /api/dashboards` の入力スキーマ。
 */
export const createDashboardInputSchema = z.object({
  title: dashboardTitleSchema,
  description: dashboardDescriptionSchema,
});
export type CreateDashboardInput = z.infer<typeof createDashboardInputSchema>;

/**
 * `PATCH /api/dashboards/:id` の入力スキーマ（部分更新）。
 */
export const updateDashboardInputSchema = z
  .object({
    title: dashboardTitleSchema.optional(),
    description: dashboardDescriptionSchema,
  })
  .refine(
    (value) => value.title !== undefined || value.description !== undefined,
    { message: "At least one field must be provided for update" },
  );
export type UpdateDashboardInput = z.infer<typeof updateDashboardInputSchema>;

// ─────────────────────────────────────────────
// react-grid-layout レイアウトアイテム
// ─────────────────────────────────────────────

/**
 * `react-grid-layout` の単一レイアウト項目（`Dashboard.layouts` に `Json` で永続化）。
 * `i` は `Widget.id` と一致させる（spec §FR-4 / architecture.md）。
 */
export const layoutItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  minW: z.number().int().min(1).optional(),
  minH: z.number().int().min(1).optional(),
});
export type LayoutItem = z.infer<typeof layoutItemSchema>;

/**
 * `Dashboard.layouts`（`Json`）の永続化形式。
 * `react-grid-layout` のブレークポイントキー（"lg", "md", "sm" 等）→ LayoutItem[] のマップ。
 * DB 境界で必ずこのスキーマでパースしてから扱う。
 */
export const dashboardLayoutsSchema = z.record(
  z.string(),
  z.array(layoutItemSchema),
);
export type DashboardLayouts = z.infer<typeof dashboardLayoutsSchema>;

/**
 * `Dashboard.layouts`（`Json`）を安全にパースする。
 * 不正値の場合は空オブジェクトとして扱う。
 */
export function parseDashboardLayouts(value: unknown): DashboardLayouts {
  if (value === null || value === undefined) return {};
  const parsed = dashboardLayoutsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

// ─────────────────────────────────────────────
// ウィジェットの query（集計設定）
// ─────────────────────────────────────────────

export const aggregateFunctionSchema = z.enum([
  "count",
  "sum",
  "avg",
  "min",
  "max",
]);
export type AggregateFunction = z.infer<typeof aggregateFunctionSchema>;

export const sortOrderSchema = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const filterOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "startsWith",
  "endsWith",
  "isNull",
  "isNotNull",
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export const widgetFilterSchema = z.object({
  column: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});
export type WidgetFilter = z.infer<typeof widgetFilterSchema>;

export const widgetSortSchema = z.object({
  column: z.string().min(1),
  order: sortOrderSchema,
});
export type WidgetSort = z.infer<typeof widgetSortSchema>;

export const widgetMeasureSchema = z.object({
  column: z.string().min(1),
  function: aggregateFunctionSchema,
  alias: z.string().optional(),
});
export type WidgetMeasure = z.infer<typeof widgetMeasureSchema>;

/**
 * `Widget.query`（`Json`）の永続化形式（集計設定）。
 * グルーピング・集計値・絞り込み・並び替え・件数上限を含む（FEAT-008）。
 */
export const widgetQuerySchema = z.object({
  groupByColumn: z.string().optional(),
  measures: z.array(widgetMeasureSchema).default([]),
  filters: z.array(widgetFilterSchema).default([]),
  sorts: z.array(widgetSortSchema).default([]),
  limit: z.number().int().min(1).max(10_000).optional(),
});
export type WidgetQuery = z.infer<typeof widgetQuerySchema>;

/**
 * `Widget.query`（`Json`）を安全にパースする。
 * 不正値の場合はデフォルトの空クエリを返す。
 */
export function parseWidgetQuery(value: unknown): WidgetQuery {
  if (value === null || value === undefined) {
    return { measures: [], filters: [], sorts: [] };
  }
  const parsed = widgetQuerySchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : { measures: [], filters: [], sorts: [] };
}

// ─────────────────────────────────────────────
// ウィジェットの config（見た目設定）
// ─────────────────────────────────────────────

export const widgetChartTypeSchema = z.enum([
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
]);
export type WidgetChartType = z.infer<typeof widgetChartTypeSchema>;

/**
 * `Widget.config`（`Json`）の永続化形式（グラフ種別・見た目設定）。
 * Sprint 5 では基本的な設定項目のみを定義し、Sprint 6 以降で拡張する。
 */
export const widgetConfigSchema = z.object({
  chartType: widgetChartTypeSchema,
  xAxisColumn: z.string().optional(),
  yAxisColumn: z.string().optional(),
  colorColumn: z.string().optional(),
  showLegend: z.boolean().default(true),
  showLabels: z.boolean().default(false),
  colorPalette: z.array(z.string()).optional(),
  schemaVersion: z.number().int().nonnegative().default(1),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

/**
 * `Widget.config`（`Json`）を安全にパースする。
 * 不正値（DB破損・スキーマバージョン不整合等）の場合はデフォルト設定を返す。
 */
export function parseWidgetConfig(value: unknown): WidgetConfig {
  if (value === null || value === undefined) {
    return {
      chartType: "bar",
      showLegend: true,
      showLabels: false,
      schemaVersion: 1,
    };
  }
  const parsed = widgetConfigSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : {
        chartType: "bar",
        showLegend: true,
        showLabels: false,
        schemaVersion: 1,
      };
}

// ─────────────────────────────────────────────
// ウィジェット入力スキーマ（CRUD）
// ─────────────────────────────────────────────

export const widgetTitleSchema = z
  .string()
  .trim()
  .max(120, { message: "widget title is too long" })
  .optional();

/**
 * `POST /api/dashboards/:id/widgets` の入力スキーマ。
 */
export const createWidgetInputSchema = z.object({
  dataSourceId: z.string().optional(),
  type: widgetChartTypeSchema,
  title: widgetTitleSchema,
  query: widgetQuerySchema.default({ measures: [], filters: [], sorts: [] }),
  config: widgetConfigSchema,
});
export type CreateWidgetInput = z.infer<typeof createWidgetInputSchema>;

/**
 * `PATCH /api/dashboards/:id/widgets/:widgetId` の入力スキーマ（部分更新）。
 */
export const updateWidgetInputSchema = z
  .object({
    dataSourceId: z.string().nullable().optional(),
    title: widgetTitleSchema,
    query: widgetQuerySchema.optional(),
    config: widgetConfigSchema.optional(),
  })
  .refine(
    (value) =>
      value.dataSourceId !== undefined ||
      value.title !== undefined ||
      value.query !== undefined ||
      value.config !== undefined,
    { message: "At least one field must be provided for update" },
  );
export type UpdateWidgetInput = z.infer<typeof updateWidgetInputSchema>;

// ─────────────────────────────────────────────
// API レスポンススキーマ
// ─────────────────────────────────────────────

export const dashboardSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  ownerId: z.string(),
  widgetCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const dashboardDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  ownerId: z.string(),
  layouts: dashboardLayoutsSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DashboardDetail = z.infer<typeof dashboardDetailSchema>;

export const widgetSummarySchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  dataSourceId: z.string().nullable(),
  type: widgetChartTypeSchema,
  title: z.string().nullable(),
  query: widgetQuerySchema,
  config: widgetConfigSchema,
});
export type WidgetSummary = z.infer<typeof widgetSummarySchema>;

export const listDashboardsApiResponseSchema = z.object({
  data: z.array(dashboardSummarySchema),
});
export type ListDashboardsApiResponse = z.infer<
  typeof listDashboardsApiResponseSchema
>;

export const dashboardDetailApiResponseSchema = z.object({
  data: dashboardDetailSchema,
  widgets: z.array(widgetSummarySchema),
});
export type DashboardDetailApiResponse = z.infer<
  typeof dashboardDetailApiResponseSchema
>;

export const createDashboardApiResponseSchema = z.object({
  data: dashboardDetailSchema,
});
export type CreateDashboardApiResponse = z.infer<
  typeof createDashboardApiResponseSchema
>;

export const widgetApiResponseSchema = z.object({
  data: widgetSummarySchema,
});
export type WidgetApiResponse = z.infer<typeof widgetApiResponseSchema>;

export const listWidgetsApiResponseSchema = z.object({
  data: z.array(widgetSummarySchema),
});
export type ListWidgetsApiResponse = z.infer<
  typeof listWidgetsApiResponseSchema
>;

// ─────────────────────────────────────────────
// ウィジェットデータ取得状態（FEAT-BF-003）
// ─────────────────────────────────────────────

/**
 * サーバーコンポーネントが各ウィジェットのデータ取得結果をクライアントに渡す形式。
 *
 * - `ok`: 正常取得済み（`queryResult` が有効）
 * - `no_datasource`: データソース未設定
 * - `error`: 取得失敗（`code` は SheetFetchErrorCode 相当の文字列でエラー種別を区別する）
 *
 * サーバーが生成してクライアントに渡す値のため、Zod パースは不要。
 */
export type WidgetDataStatus =
  | { status: "ok" }
  | { status: "no_datasource" }
  | { status: "error"; code: string };

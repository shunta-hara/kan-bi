"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import type { UpdateWidgetState } from "@/lib/dashboards/widgetActions";
import type {
  WidgetSummary,
  WidgetFilter,
  WidgetSort,
} from "@/lib/dashboards/schema";
import {
  widgetChartTypeSchema,
  widgetQuerySchema,
  widgetConfigSchema,
  filterOperatorSchema,
  sortOrderSchema,
} from "@/lib/dashboards/schema";
import {
  dataSourceDetailApiResponseSchema,
  type InferredColumn,
} from "@/lib/sheets/schema";
import {
  autoRecommend,
  resultToFormState,
  hasExistingFormSettings,
  type RecommendFormState,
} from "@/lib/query/autoRecommend";

type DataSourceOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  widget: WidgetSummary;
  dataSources: DataSourceOption[];
  updateWidgetAction: (
    prevState: UpdateWidgetState,
    formData: FormData,
  ) => Promise<UpdateWidgetState>;
  labels: {
    title: string;
    dataSourceLabel: string;
    dataSourceNone: string;
    chartTypeLabel: string;
    groupByColumnLabel: string;
    groupByColumnPlaceholder: string;
    measuresLabel: string;
    measureColumnPlaceholder: string;
    measureFunctionLabel: string;
    xAxisColumnLabel: string;
    xAxisColumnPlaceholder: string;
    yAxisColumnLabel: string;
    yAxisColumnPlaceholder: string;
    showLegendLabel: string;
    showLabelsLabel: string;
    previewHeading: string;
    saveButton: string;
    savingButton: string;
    cancelButton: string;
    chartTypes: Record<string, string>;
    aggregateFunctions: Record<string, string>;
  };
};

const CHART_TYPES = [
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

const AGGREGATE_FUNCTIONS = ["count", "sum", "avg", "min", "max"] as const;

/** X/Y 軸設定が意味を持つデカルト座標系グラフ */
const CARTESIAN_CHARTS = new Set([
  "bar",
  "line",
  "area",
  "scatter",
  "bubble",
  "heatmap",
]);
/** ディメンション + 値のみで完結するグラフ（X/Y 軸不要） */
const DIMENSION_VALUE_CHARTS = new Set([
  "pie",
  "donut",
  "radar",
  "treemap",
  "funnel",
]);
/** スカラー値だけで完結するグラフ（グルーピング・軸不要） */
const SCALAR_CHARTS = new Set(["kpi", "gauge"]);

const FILTER_OPERATORS = [
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
] as const;

/** isNull / isNotNull は value 入力が不要な演算子 */
const NO_VALUE_OPERATORS = new Set(["isNull", "isNotNull"]);

/**
 * ウィジェット設定編集ダイアログ（FEAT-008）。
 *
 * - グルーピング・集計・軸割当・配色・凡例等を設定できる。
 * - 絞り込み条件・並び替え・件数上限を設定できる。
 * - フォームの値変更はその場でプレビューパネルに反映される（ライブプレビュー）。
 * - 保存は updateWidgetAction（Server Action）経由で行い、revalidatePath で再取得される。
 */
export function WidgetEditDialog({
  open,
  onClose,
  widget,
  dataSources,
  updateWidgetAction,
  labels,
}: Props) {
  const t = useTranslations("widgetEditDialog");

  const [state, dispatch, isPending] = useActionState<
    UpdateWidgetState,
    FormData
  >(updateWidgetAction, { status: "idle" });

  // ライブプレビュー用のローカル状態
  const [previewDataSourceId, setPreviewDataSourceId] = useState<string>(
    widget.dataSourceId ?? "",
  );
  const [previewChartType, setPreviewChartType] = useState(
    widget.config.chartType,
  );
  const [previewGroupByColumn, setPreviewGroupByColumn] = useState(
    widget.query.groupByColumn ?? "",
  );
  const [previewMeasureColumn, setPreviewMeasureColumn] = useState(
    widget.query.measures[0]?.column ?? "",
  );
  const [previewMeasureFunction, setPreviewMeasureFunction] = useState(
    widget.query.measures[0]?.function ?? "count",
  );
  const [previewXAxisColumn, setPreviewXAxisColumn] = useState(
    widget.config.xAxisColumn ?? "",
  );
  const [previewYAxisColumn, setPreviewYAxisColumn] = useState(
    widget.config.yAxisColumn ?? "",
  );
  const [previewShowLegend, setPreviewShowLegend] = useState(
    widget.config.showLegend,
  );
  const [previewShowLabels, setPreviewShowLabels] = useState(
    widget.config.showLabels,
  );
  // データソース選択時に型情報付き列情報を取得（FEAT-AR-003）
  const [availableColumns, setAvailableColumns] = useState<InferredColumn[]>(
    [],
  );
  const [columnsLoading, setColumnsLoading] = useState(false);
  // おすすめ設定の上書き確認・適用結果（FEAT-AR-004 / FEAT-AR-005 / FEAT-AR-006）
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [appliedRationale, setAppliedRationale] = useState("");
  // availableColumns が更新されるたびに推薦結果を再計算
  const recommendation = useMemo(
    () => autoRecommend(availableColumns),
    [availableColumns],
  );

  useEffect(() => {
    if (!previewDataSourceId) {
      setAvailableColumns([]);
      return;
    }
    let cancelled = false;
    // データソース変更時に前のデータソースの型情報・推薦状態を即座にリセット
    setAvailableColumns([]);
    setShowOverwriteConfirm(false);
    setAppliedRationale("");
    setColumnsLoading(true);
    fetch(`/api/datasources/${previewDataSourceId}`)
      .then((res) => res.json())
      .then((json: unknown) => {
        if (cancelled) return;
        const parsed = dataSourceDetailApiResponseSchema.safeParse(json);
        if (parsed.success) {
          // 型情報付きの InferredColumn[] として保持する
          setAvailableColumns(parsed.data.data.preview.columns);
        }
      })
      .catch(() => {
        /* 列取得失敗は無視（型情報は空として扱う） */
      })
      .finally(() => {
        if (!cancelled) setColumnsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewDataSourceId]);

  // 絞り込み条件・並び替え・件数上限
  const [previewFilters, setPreviewFilters] = useState<WidgetFilter[]>(
    widget.query.filters,
  );
  const [previewSorts, setPreviewSorts] = useState<WidgetSort[]>(
    widget.query.sorts,
  );
  const [previewLimit, setPreviewLimit] = useState<string>(
    widget.query.limit !== undefined ? String(widget.query.limit) : "",
  );

  // 成功時はダイアログを閉じる
  useEffect(() => {
    if (state.status === "success") {
      onClose();
    }
  }, [state.status, onClose]);

  // ダイアログが開かれたとき最新の widget 値でリセット
  useEffect(() => {
    if (open) {
      setPreviewDataSourceId(widget.dataSourceId ?? "");
      setAvailableColumns([]);
      setShowOverwriteConfirm(false);
      setAppliedRationale("");
      setPreviewChartType(widget.config.chartType);
      setPreviewGroupByColumn(widget.query.groupByColumn ?? "");
      setPreviewMeasureColumn(widget.query.measures[0]?.column ?? "");
      setPreviewMeasureFunction(widget.query.measures[0]?.function ?? "count");
      setPreviewXAxisColumn(widget.config.xAxisColumn ?? "");
      setPreviewYAxisColumn(widget.config.yAxisColumn ?? "");
      setPreviewShowLegend(widget.config.showLegend);
      setPreviewShowLabels(widget.config.showLabels);
      setPreviewFilters(widget.query.filters);
      setPreviewSorts(widget.query.sorts);
      setPreviewLimit(
        widget.query.limit !== undefined ? String(widget.query.limit) : "",
      );
    }
  }, [open, widget]);

  // ── 絞り込み条件 ──────────────────────────────────
  function addFilter() {
    setPreviewFilters((prev) => [
      ...prev,
      { column: "", operator: "eq" as const, value: "" },
    ]);
  }

  function removeFilter(index: number) {
    setPreviewFilters((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFilterColumn(index: number, column: string) {
    setPreviewFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, column } : f)),
    );
  }

  function updateFilterOperator(index: number, operator: string) {
    const parsed = filterOperatorSchema.safeParse(operator);
    if (!parsed.success) return;
    setPreviewFilters((prev) =>
      prev.map((f, i) =>
        i === index
          ? {
              ...f,
              operator: parsed.data,
              value: NO_VALUE_OPERATORS.has(parsed.data) ? undefined : f.value,
            }
          : f,
      ),
    );
  }

  function updateFilterValue(index: number, value: string) {
    setPreviewFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, value } : f)),
    );
  }

  // ── 並び替え ──────────────────────────────────────
  function addSort() {
    setPreviewSorts((prev) => [...prev, { column: "", order: "asc" as const }]);
  }

  function removeSort(index: number) {
    setPreviewSorts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSortColumn(index: number, column: string) {
    setPreviewSorts((prev) =>
      prev.map((s, i) => (i === index ? { ...s, column } : s)),
    );
  }

  function updateSortOrder(index: number, order: string) {
    const parsed = sortOrderSchema.safeParse(order);
    if (!parsed.success) return;
    setPreviewSorts((prev) =>
      prev.map((s, i) => (i === index ? { ...s, order: parsed.data } : s)),
    );
  }

  /** 推薦結果をフォームの各フィールドに適用する（FEAT-AR-004） */
  function applyRecommendation() {
    const formState = resultToFormState(recommendation);
    setPreviewChartType(formState.chartType);
    setPreviewGroupByColumn(formState.groupByColumn);
    setPreviewMeasureColumn(formState.measureColumn);
    setPreviewMeasureFunction(formState.measureFunction);
    setPreviewXAxisColumn(formState.xAxisColumn);
    setPreviewYAxisColumn(formState.yAxisColumn);
    setAppliedRationale(recommendation.rationale);
    setShowOverwriteConfirm(false);
  }

  /** 「おすすめ設定を適用」ボタン押下ハンドラ（FEAT-AR-004 / FEAT-AR-006） */
  function handleApplyRecommend() {
    const currentState: RecommendFormState = {
      chartType: previewChartType,
      groupByColumn: previewGroupByColumn,
      measureColumn: previewMeasureColumn,
      measureFunction: previewMeasureFunction,
      xAxisColumn: previewXAxisColumn,
      yAxisColumn: previewYAxisColumn,
    };
    if (hasExistingFormSettings(currentState)) {
      setShowOverwriteConfirm(true);
    } else {
      applyRecommendation();
    }
  }

  /** フォームサブミット時に query / config を JSON 文字列として hidden input に詰める */
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // limit を数値に変換（空文字は undefined）
    const limitNum =
      previewLimit.trim() !== "" ? parseInt(previewLimit, 10) : undefined;

    // query を組み立ててバリデーション
    const queryRaw = {
      groupByColumn: previewGroupByColumn || undefined,
      measures: previewMeasureColumn
        ? [{ column: previewMeasureColumn, function: previewMeasureFunction }]
        : [],
      filters: previewFilters,
      sorts: previewSorts,
      limit: limitNum,
    };
    const queryParsed = widgetQuerySchema.safeParse(queryRaw);
    if (!queryParsed.success) return;

    // config を組み立ててバリデーション
    const configRaw = {
      chartType: previewChartType,
      xAxisColumn: previewXAxisColumn || undefined,
      yAxisColumn: previewYAxisColumn || undefined,
      showLegend: previewShowLegend,
      showLabels: previewShowLabels,
      colorPalette: widget.config.colorPalette,
      schemaVersion: widget.config.schemaVersion,
    };
    const configParsed = widgetConfigSchema.safeParse(configRaw);
    if (!configParsed.success) return;

    formData.set("query", JSON.stringify(queryParsed.data));
    formData.set("config", JSON.stringify(configParsed.data));
    formData.set("dataSourceId", previewDataSourceId);

    dispatch(formData);
  }

  // ライブプレビューパネルに表示する設定サマリ
  const previewDataSourceName = previewDataSourceId
    ? (dataSources.find((ds) => ds.id === previewDataSourceId)?.name ??
      previewDataSourceId)
    : labels.dataSourceNone;

  const parsedPreviewChartType =
    widgetChartTypeSchema.safeParse(previewChartType);
  const displayChartType = parsedPreviewChartType.success
    ? (labels.chartTypes[parsedPreviewChartType.data] ??
      parsedPreviewChartType.data)
    : previewChartType;

  // チャート種別に応じて表示するフィールドを制御
  const showGroupBy =
    !SCALAR_CHARTS.has(previewChartType) && previewChartType !== "table";
  const showXYAxis = CARTESIAN_CHARTS.has(previewChartType);

  // 有効な絞り込み条件（column が空でないもの）
  const validFilters = previewFilters.filter((f) => f.column.trim() !== "");
  // 有効な並び替え（column が空でないもの）
  const validSorts = previewSorts.filter((s) => s.column.trim() !== "");

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/15 dark:bg-neutral-900">
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-lg font-semibold">{labels.title}</h2>

            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
              {/* 左カラム: 設定フォーム */}
              <form
                onSubmit={handleSubmit}
                className="flex flex-1 flex-col gap-4"
              >
                {/* hidden inputs */}
                <input
                  type="hidden"
                  name="dashboardId"
                  value={widget.dashboardId}
                />
                <input type="hidden" name="widgetId" value={widget.id} />

                {/* データソース */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-widget-datasource"
                    className="text-sm font-medium"
                  >
                    {labels.dataSourceLabel}
                  </label>
                  <select
                    id="edit-widget-datasource"
                    name="dataSourceId"
                    value={previewDataSourceId}
                    onChange={(e) => setPreviewDataSourceId(e.target.value)}
                    className="rounded-lg border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:focus:ring-white/20"
                  >
                    <option value="">{labels.dataSourceNone}</option>
                    {dataSources.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* おすすめ設定を適用（FEAT-AR-004 / FEAT-AR-005 / FEAT-AR-006） */}
                {previewDataSourceId !== "" && !columnsLoading ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[.02] px-3 py-2.5 dark:border-white/10 dark:bg-white/[.02]">
                    {showOverwriteConfirm ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-black/70 dark:text-white/70">
                          {t("autoRecommendConfirmMessage")}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={applyRecommendation}
                            className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                          >
                            {t("autoRecommendConfirmYes")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowOverwriteConfirm(false)}
                            className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
                          >
                            {t("autoRecommendConfirmCancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleApplyRecommend}
                        className="self-start rounded-full border border-black/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
                      >
                        {t("autoRecommendButton")}
                      </button>
                    )}
                    <p className="truncate text-xs text-black/40 dark:text-white/50">
                      {recommendation.rationale}
                    </p>
                  </div>
                ) : null}

                {/* グラフ種別 */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-widget-chart-type"
                    className="text-sm font-medium"
                  >
                    {labels.chartTypeLabel}
                  </label>
                  <select
                    id="edit-widget-chart-type"
                    name="chartType"
                    value={previewChartType}
                    onChange={(e) => {
                      const parsed = widgetChartTypeSchema.safeParse(
                        e.target.value,
                      );
                      if (parsed.success) setPreviewChartType(parsed.data);
                    }}
                    className="rounded-lg border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:focus:ring-white/20"
                  >
                    {CHART_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {labels.chartTypes[type] ?? type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* グルーピング列（スカラー系・テーブルは不要） */}
                {showGroupBy ? (
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="edit-widget-group-by"
                      className="text-sm font-medium"
                    >
                      {labels.groupByColumnLabel}
                    </label>
                    <ColumnSelect
                      id="edit-widget-group-by"
                      value={previewGroupByColumn}
                      onChange={setPreviewGroupByColumn}
                      columns={availableColumns.map((c) => c.name)}
                      loading={columnsLoading}
                      placeholder={labels.groupByColumnPlaceholder}
                    />
                  </div>
                ) : null}

                {/* 集計 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">
                    {labels.measuresLabel}
                  </span>
                  <div className="flex gap-2">
                    <ColumnSelect
                      id="edit-widget-measure-column"
                      value={previewMeasureColumn}
                      onChange={setPreviewMeasureColumn}
                      columns={availableColumns.map((c) => c.name)}
                      loading={columnsLoading}
                      placeholder={labels.measureColumnPlaceholder}
                      className="flex-1"
                    />
                    <select
                      id="edit-widget-measure-function"
                      name="measureFunction"
                      value={previewMeasureFunction}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (
                          val === "count" ||
                          val === "sum" ||
                          val === "avg" ||
                          val === "min" ||
                          val === "max"
                        ) {
                          setPreviewMeasureFunction(val);
                        }
                      }}
                      aria-label={labels.measureFunctionLabel}
                      className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:text-white dark:focus:ring-white/20"
                    >
                      {AGGREGATE_FUNCTIONS.map((fn) => (
                        <option key={fn} value={fn}>
                          {labels.aggregateFunctions[fn] ?? fn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* X/Y 軸列（デカルト座標系グラフのみ） */}
                {showXYAxis ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="edit-widget-x-axis"
                        className="text-sm font-medium"
                      >
                        {labels.xAxisColumnLabel}
                      </label>
                      <ColumnSelect
                        id="edit-widget-x-axis"
                        value={previewXAxisColumn}
                        onChange={setPreviewXAxisColumn}
                        columns={availableColumns.map((c) => c.name)}
                        loading={columnsLoading}
                        placeholder={labels.xAxisColumnPlaceholder}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="edit-widget-y-axis"
                        className="text-sm font-medium"
                      >
                        {labels.yAxisColumnLabel}
                      </label>
                      <ColumnSelect
                        id="edit-widget-y-axis"
                        value={previewYAxisColumn}
                        onChange={setPreviewYAxisColumn}
                        columns={availableColumns.map((c) => c.name)}
                        loading={columnsLoading}
                        placeholder={labels.yAxisColumnPlaceholder}
                      />
                    </div>
                  </>
                ) : null}

                {/* 凡例・ラベル */}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="showLegend"
                      checked={previewShowLegend}
                      onChange={(e) => setPreviewShowLegend(e.target.checked)}
                      className="rounded border-black/20 dark:border-white/20"
                    />
                    {labels.showLegendLabel}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="showLabels"
                      checked={previewShowLabels}
                      onChange={(e) => setPreviewShowLabels(e.target.checked)}
                      className="rounded border-black/20 dark:border-white/20"
                    />
                    {labels.showLabelsLabel}
                  </label>
                </div>

                {/* ── 絞り込み条件 ──────────────────────────── */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t("filterHeading")}
                    </span>
                    <button
                      type="button"
                      onClick={addFilter}
                      className="rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
                    >
                      {t("filterAddButton")}
                    </button>
                  </div>

                  {previewFilters.length === 0 ? (
                    <p className="text-xs text-black/40 dark:text-white/60">
                      {t("filterNone")}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {previewFilters.map((filter, index) => (
                        <FilterRow
                          key={index}
                          filter={filter}
                          index={index}
                          columns={availableColumns.map((c) => c.name)}
                          onColumnChange={updateFilterColumn}
                          onOperatorChange={updateFilterOperator}
                          onValueChange={updateFilterValue}
                          onRemove={removeFilter}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── 並び替え ────────────────────────────── */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t("sortHeading")}
                    </span>
                    <button
                      type="button"
                      onClick={addSort}
                      className="rounded-full border border-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
                    >
                      {t("sortAddButton")}
                    </button>
                  </div>

                  {previewSorts.length === 0 ? (
                    <p className="text-xs text-black/40 dark:text-white/60">
                      {t("sortNone")}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {previewSorts.map((sort, index) => (
                        <SortRow
                          key={index}
                          sort={sort}
                          index={index}
                          columns={availableColumns.map((c) => c.name)}
                          onColumnChange={updateSortColumn}
                          onOrderChange={updateSortOrder}
                          onRemove={removeSort}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── 件数上限 ─────────────────────────────── */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-widget-limit"
                    className="text-sm font-medium"
                  >
                    {t("limitLabel")}
                  </label>
                  <input
                    id="edit-widget-limit"
                    name="limit"
                    type="number"
                    min={1}
                    max={10000}
                    placeholder={t("limitPlaceholder")}
                    value={previewLimit}
                    onChange={(e) => setPreviewLimit(e.target.value)}
                    className="rounded-lg border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:focus:ring-white/20"
                  />
                </div>

                {state.status === "error" ? (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {state.message}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
                  >
                    {labels.cancelButton}
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
                  >
                    {isPending ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        {labels.savingButton}
                      </>
                    ) : (
                      labels.saveButton
                    )}
                  </button>
                </div>
              </form>

              {/* 右カラム: ライブプレビュー */}
              <div className="flex w-full flex-col gap-3 lg:w-56">
                <h3 className="text-sm font-medium text-black/60 dark:text-white/60">
                  {labels.previewHeading}
                </h3>
                <div
                  className="flex flex-col gap-2 rounded-xl border border-black/10 bg-black/[.03] p-4 text-xs dark:border-white/15 dark:bg-white/[.04]"
                  aria-live="polite"
                  aria-label={labels.previewHeading}
                >
                  <PreviewRow
                    label={t("previewLabels.chartType")}
                    value={displayChartType}
                  />
                  <PreviewRow
                    label={t("previewLabels.dataSource")}
                    value={previewDataSourceName}
                  />
                  {previewGroupByColumn ? (
                    <PreviewRow
                      label={t("previewLabels.groupBy")}
                      value={previewGroupByColumn}
                    />
                  ) : null}
                  {previewMeasureColumn ? (
                    <PreviewRow
                      label={t("previewLabels.aggregate")}
                      value={`${labels.aggregateFunctions[previewMeasureFunction] ?? previewMeasureFunction}(${previewMeasureColumn})`}
                    />
                  ) : null}
                  {previewXAxisColumn ? (
                    <PreviewRow
                      label={t("previewLabels.xAxis")}
                      value={previewXAxisColumn}
                    />
                  ) : null}
                  {previewYAxisColumn ? (
                    <PreviewRow
                      label={t("previewLabels.yAxis")}
                      value={previewYAxisColumn}
                    />
                  ) : null}
                  <PreviewRow
                    label={t("previewLabels.legend")}
                    value={
                      previewShowLegend
                        ? t("previewLabels.legendVisible")
                        : t("previewLabels.legendHidden")
                    }
                  />
                  <PreviewRow
                    label={t("previewLabels.labels")}
                    value={
                      previewShowLabels
                        ? t("previewLabels.labelsVisible")
                        : t("previewLabels.labelsHidden")
                    }
                  />
                  {validFilters.length > 0 ? (
                    <PreviewRow
                      label={t("previewLabels.filters")}
                      value={t("previewLabels.filtersCount", {
                        count: validFilters.length,
                      })}
                    />
                  ) : null}
                  {validSorts.length > 0 ? (
                    <PreviewRow
                      label={t("previewLabels.sorts")}
                      value={validSorts
                        .map((s) => `${s.column} ${s.order}`)
                        .join(", ")}
                    />
                  ) : null}
                  {previewLimit.trim() !== "" ? (
                    <PreviewRow
                      label={t("previewLabels.limit")}
                      value={t("previewLabels.limitCount", {
                        count: previewLimit,
                      })}
                    />
                  ) : null}
                  {appliedRationale ? (
                    <div className="mt-1 border-t border-black/5 pt-2 dark:border-white/10">
                      <p className="line-clamp-2 text-xs italic text-black/40 dark:text-white/40">
                        {appliedRationale}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── サブコンポーネント ──────────────────────────────────────────────────

type ColumnSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  columns: string[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
  size?: "sm" | "xs";
};

function ColumnSelect({
  id,
  value,
  onChange,
  columns,
  loading = false,
  placeholder,
  className = "",
  size = "sm",
}: ColumnSelectProps) {
  const base =
    size === "xs"
      ? "rounded border border-black/15 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:text-white dark:focus:ring-white/20"
      : "rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:text-white dark:focus:ring-white/20";

  if (loading) {
    return (
      <div
        className={`${base} flex items-center text-black/40 dark:text-white/40 ${className}`}
      >
        ···
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${className}`}
    >
      <option value="">{placeholder ?? "—"}</option>
      {/* 現在値が列リストにない場合（既存設定）も選択肢として残す */}
      {value && !columns.includes(value) ? (
        <option value={value}>{value}</option>
      ) : null}
      {columns.map((col) => (
        <option key={col} value={col}>
          {col}
        </option>
      ))}
    </select>
  );
}

type FilterRowProps = {
  filter: WidgetFilter;
  index: number;
  columns: string[];
  onColumnChange: (index: number, value: string) => void;
  onOperatorChange: (index: number, value: string) => void;
  onValueChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
};

function FilterRow({
  filter,
  index,
  columns,
  onColumnChange,
  onOperatorChange,
  onValueChange,
  onRemove,
}: FilterRowProps) {
  const t = useTranslations("widgetEditDialog");
  const needsValue = !NO_VALUE_OPERATORS.has(filter.operator);
  const displayIndex = index + 1;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/10 p-2 dark:border-white/10">
      <div className="flex gap-1">
        <ColumnSelect
          value={filter.column}
          onChange={(v) => onColumnChange(index, v)}
          columns={columns}
          placeholder={t("filterColumnPlaceholder")}
          size="xs"
          className="flex-1"
        />
        <select
          value={filter.operator}
          onChange={(e) => onOperatorChange(index, e.target.value)}
          aria-label={t("filterOperatorAriaLabel", { index: displayIndex })}
          className="rounded border border-black/15 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:text-white dark:focus:ring-white/20"
        >
          {FILTER_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {t(`filterOperators.${op}` as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={t("filterRemoveAriaLabel", { index: displayIndex })}
          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          {t("deleteButton")}
        </button>
      </div>
      {needsValue ? (
        <input
          type="text"
          placeholder={t("filterValuePlaceholder")}
          value={
            filter.value !== null && filter.value !== undefined
              ? String(filter.value)
              : ""
          }
          onChange={(e) => onValueChange(index, e.target.value)}
          aria-label={t("filterValueAriaLabel", { index: displayIndex })}
          className="rounded border border-black/15 px-2 py-1 text-xs placeholder:text-black/35 focus:outline-none focus:ring-1 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:placeholder:text-white/35 dark:focus:ring-white/20"
        />
      ) : null}
    </div>
  );
}

type SortRowProps = {
  sort: WidgetSort;
  index: number;
  columns: string[];
  onColumnChange: (index: number, value: string) => void;
  onOrderChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
};

function SortRow({
  sort,
  index,
  columns,
  onColumnChange,
  onOrderChange,
  onRemove,
}: SortRowProps) {
  const t = useTranslations("widgetEditDialog");
  const displayIndex = index + 1;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-black/10 p-2 dark:border-white/10">
      <ColumnSelect
        value={sort.column}
        onChange={(v) => onColumnChange(index, v)}
        columns={columns}
        placeholder={t("sortColumnPlaceholder")}
        size="xs"
        className="flex-1"
      />
      <select
        value={sort.order}
        onChange={(e) => onOrderChange(index, e.target.value)}
        aria-label={t("sortOrderAriaLabel", { index: displayIndex })}
        className="rounded border border-black/15 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:text-white dark:focus:ring-white/20"
      >
        <option value="asc">{t("sortOrderAsc")}</option>
        <option value="desc">{t("sortOrderDesc")}</option>
      </select>
      <button
        type="button"
        onClick={() => onRemove(index)}
        aria-label={t("sortRemoveAriaLabel", { index: displayIndex })}
        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        {t("deleteButton")}
      </button>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-black/50 dark:text-white/60">{label}</span>
      <span className="max-w-[60%] break-all text-right font-medium">
        {value}
      </span>
    </div>
  );
}

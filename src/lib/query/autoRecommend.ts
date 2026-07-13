/**
 * ウィジェット自動推薦ロジック（FEAT-AR-001 / Sprint 1）。
 *
 * - `InferredColumn[]` を入力とする純粋関数。外部 API・DB・ランダム値に依存しない。
 * - 副作用なし・冪等。同じ入力に対して常に同じ結果を返す。
 * - server-only に依存しないため Vitest から直接テスト可能（[[feedback-server-only-testability]]）。
 */

import type { InferredColumn } from "@/lib/sheets/schema";
import type {
  WidgetChartType,
  AggregateFunction,
} from "@/lib/dashboards/schema";

// ─────────────────────────────────────────────
// 推薦結果の型
// ─────────────────────────────────────────────

export type RecommendMeasure = {
  column: string;
  function: AggregateFunction;
};

/**
 * `autoRecommend` の返却型。
 * - `chartType`: 推薦チャート種別
 * - `groupByColumn`: クエリのグルーピング列（未設定時は undefined）
 * - `measures`: 集計設定（0〜1件）
 * - `xAxisColumn`: config の X 軸列（未設定時は undefined）
 * - `yAxisColumn`: config の Y 軸列（未設定時は undefined）
 * - `rationale`: 推薦根拠テキスト（1行）
 */
export type AutoRecommendResult = {
  chartType: WidgetChartType;
  groupByColumn: string | undefined;
  measures: RecommendMeasure[];
  xAxisColumn: string | undefined;
  yAxisColumn: string | undefined;
  rationale: string;
};

/**
 * ダイアログのフォームフィールドと対応する形にフラット化した推薦状態型。
 * `WidgetEditDialog` の各 `setState` 呼び出し引数と 1:1 で対応する（FEAT-AR-004）。
 */
export type RecommendFormState = {
  chartType: WidgetChartType;
  groupByColumn: string;
  measureColumn: string;
  measureFunction: AggregateFunction;
  xAxisColumn: string;
  yAxisColumn: string;
};

/**
 * `AutoRecommendResult` をダイアログのフォーム状態に変換する純粋関数（FEAT-AR-004）。
 *
 * - 未設定フィールド（undefined）は空文字列として扱う。
 * - 集計関数が省略された場合（scatter / table 等）は `"count"` をデフォルトとする。
 *
 * @param result - `autoRecommend` の返却値
 * @returns ダイアログの各 preview state に直接渡せる形のフォーム状態
 */
export function resultToFormState(
  result: AutoRecommendResult,
): RecommendFormState {
  return {
    chartType: result.chartType,
    groupByColumn: result.groupByColumn ?? "",
    measureColumn: result.measures[0]?.column ?? "",
    measureFunction: result.measures[0]?.function ?? "count",
    xAxisColumn: result.xAxisColumn ?? "",
    yAxisColumn: result.yAxisColumn ?? "",
  };
}

/**
 * フォーム状態に列設定（グルーピング・集計・軸）が存在するかを判定する純粋関数（FEAT-AR-006）。
 *
 * `chartType` は常に値を持つため判定対象から除外する。
 * グルーピング列・集計列・X 軸・Y 軸のいずれかが空でない場合に `true` を返す。
 * 「おすすめ設定を適用」ボタン押下時に上書き確認ダイアログを表示するかの判断に使用する。
 *
 * @param state - 現在のフォーム状態
 * @returns 列設定が 1 件以上存在する場合 `true`、すべて空の場合 `false`
 */
export function hasExistingFormSettings(state: RecommendFormState): boolean {
  return (
    state.groupByColumn.trim() !== "" ||
    state.measureColumn.trim() !== "" ||
    state.xAxisColumn.trim() !== "" ||
    state.yAxisColumn.trim() !== ""
  );
}

// ─────────────────────────────────────────────
// 推薦ルールテーブル（優先度順）
// ─────────────────────────────────────────────

/**
 * 列型情報から最適なチャート種別・軸・集計設定を推薦する純粋関数。
 *
 * ルール（優先度順）:
 * 1. 列が 0 件 → table
 * 2. number も date も 0 件（文字列のみ）→ table
 * 3. number 1 件・string 0 件・date 0 件 → kpi
 * 4. number ≥2 件・string 0 件・date 0 件 → scatter
 * 5. date ≥1 件・number ≥1 件（string の有無問わず）→ line
 * 6. string ≥1 件・number ≥1 件・date 0 件 → bar
 * 7. 上記すべてに該当しない → table
 *
 * @param columns - データソースの推論済み列情報（`InferredColumn[]`）
 * @returns 推薦結果オブジェクト（例外を投げない。空配列を含む任意の入力に対して有効な値を返す）
 */
export function autoRecommend(columns: InferredColumn[]): AutoRecommendResult {
  const numbers = columns.filter((c) => c.inferredType === "number");
  const dates = columns.filter((c) => c.inferredType === "date");
  const strings = columns.filter((c) => c.inferredType === "string");

  // ルール 1: 列が 0 件
  if (columns.length === 0) {
    return {
      chartType: "table",
      groupByColumn: undefined,
      measures: [],
      xAxisColumn: undefined,
      yAxisColumn: undefined,
      rationale: "列情報がないためテーブル表示を推薦します",
    };
  }

  // ルール 2: number も date も 0 件（文字列のみ）
  if (numbers.length === 0 && dates.length === 0) {
    return {
      chartType: "table",
      groupByColumn: undefined,
      measures: [],
      xAxisColumn: undefined,
      yAxisColumn: undefined,
      rationale: "数値列や日付列がないためテーブル表示を推薦します",
    };
  }

  // ルール 3: number 1 件・string 0 件・date 0 件 → kpi
  if (numbers.length === 1 && strings.length === 0 && dates.length === 0) {
    const numCol = numbers[0].name;
    return {
      chartType: "kpi",
      groupByColumn: undefined,
      measures: [{ column: numCol, function: "sum" }],
      xAxisColumn: undefined,
      yAxisColumn: numCol,
      rationale: `数値列（${numCol}）のみが見つかったため KPI を推薦します`,
    };
  }

  // ルール 4: number ≥2 件・string 0 件・date 0 件 → scatter
  if (numbers.length >= 2 && strings.length === 0 && dates.length === 0) {
    const xCol = numbers[0].name;
    const yCol = numbers[1].name;
    return {
      chartType: "scatter",
      groupByColumn: undefined,
      measures: [],
      xAxisColumn: xCol,
      yAxisColumn: yCol,
      rationale: `複数の数値列（${xCol}、${yCol}）が見つかったため散布図を推薦します`,
    };
  }

  // ルール 5: date ≥1 件・number ≥1 件（string の有無問わず）→ line
  if (dates.length >= 1 && numbers.length >= 1) {
    const dateCol = dates[0].name;
    const numCol = numbers[0].name;
    return {
      chartType: "line",
      groupByColumn: dateCol,
      measures: [{ column: numCol, function: "sum" }],
      xAxisColumn: dateCol,
      yAxisColumn: numCol,
      rationale: `日付列（${dateCol}）と数値列（${numCol}）が見つかったため折れ線グラフを推薦します`,
    };
  }

  // ルール 6: string ≥1 件・number ≥1 件・date 0 件 → bar
  if (strings.length >= 1 && numbers.length >= 1 && dates.length === 0) {
    const strCol = strings[0].name;
    const numCol = numbers[0].name;
    return {
      chartType: "bar",
      groupByColumn: strCol,
      measures: [{ column: numCol, function: "sum" }],
      xAxisColumn: strCol,
      yAxisColumn: numCol,
      rationale: `文字列列（${strCol}）と数値列（${numCol}）が見つかったため棒グラフを推薦します`,
    };
  }

  // ルール 7: 上記すべてに該当しない → table
  return {
    chartType: "table",
    groupByColumn: undefined,
    measures: [],
    xAxisColumn: undefined,
    yAxisColumn: undefined,
    rationale:
      "最適なチャート種別が特定できなかったためテーブル表示を推薦します",
  };
}

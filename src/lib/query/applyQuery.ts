/**
 * クエリ適用ロジック（FEAT-009 / Sprint 6）。
 *
 * - `server-only` / `prisma` に依存しないため Vitest から直接テスト可能。
 * - `SheetTable`（正規化済みデータ）に `WidgetQuery` を適用して集計結果を返す。
 * - 集計は必ずサーバー側で確定させる（architecture.md "集計はサーバー側で確定"）。
 */

import type {
  WidgetQuery,
  WidgetFilter,
  WidgetSort,
} from "@/lib/dashboards/schema";

/**
 * グラフ描画・クエリ適用に使う正規化済み行データの型。
 * 列名 → セル値（文字列・数値・null）のマップ。
 */
export type NormalizedRow = Record<string, string | number | null | undefined>;

/**
 * クエリ適用後の集計行。
 * `key` は groupByColumn の値（または "_total" でグルーピングなし）、
 * `values` は measureAlias → 集計値のマップ。
 */
export type QueryResultRow = {
  key: string;
  values: Record<string, number | null>;
};

/**
 * クエリ適用結果。グラフ描画用の整形済みデータ。
 */
export type QueryResult = {
  /** groupBy の列名（未指定時は undefined） */
  groupByColumn: string | undefined;
  /** groupBy キーの配列（グラフの X 軸 / カテゴリ用） */
  categories: string[];
  /** 集計行（categories と同じ順序） */
  rows: QueryResultRow[];
  /** 集計列名の配列（measures のエイリアスまたは "column_function" 形式） */
  measureNames: string[];
};

// ─────────────────────────────────────────────
// フィルタ適用
// ─────────────────────────────────────────────

function applyFilter(row: NormalizedRow, filter: WidgetFilter): boolean {
  const { column, operator, value } = filter;
  const cellValue = row[column];

  if (operator === "isNull")
    return cellValue === null || cellValue === undefined;
  if (operator === "isNotNull")
    return cellValue !== null && cellValue !== undefined;

  const cell = cellValue ?? null;

  switch (operator) {
    case "eq":
      return String(cell) === String(value);
    case "neq":
      return String(cell) !== String(value);
    case "gt":
      return Number(cell) > Number(value);
    case "gte":
      return Number(cell) >= Number(value);
    case "lt":
      return Number(cell) < Number(value);
    case "lte":
      return Number(cell) <= Number(value);
    case "contains":
      return (
        typeof cell === "string" &&
        typeof value === "string" &&
        cell.includes(value)
      );
    case "startsWith":
      return (
        typeof cell === "string" &&
        typeof value === "string" &&
        cell.startsWith(value)
      );
    case "endsWith":
      return (
        typeof cell === "string" &&
        typeof value === "string" &&
        cell.endsWith(value)
      );
    default:
      return true;
  }
}

// ─────────────────────────────────────────────
// ソート適用
// ─────────────────────────────────────────────

function applySort(
  rows: NormalizedRow[],
  sorts: WidgetSort[],
): NormalizedRow[] {
  if (sorts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = a[sort.column] ?? null;
      const bVal = b[sort.column] ?? null;
      const aStr = aVal === null ? "" : String(aVal);
      const bStr = bVal === null ? "" : String(bVal);
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      const useNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      const cmp = useNumeric ? aNum - bNum : aStr.localeCompare(bStr, "ja");
      if (cmp !== 0) return sort.order === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

// ─────────────────────────────────────────────
// 集計関数
// ─────────────────────────────────────────────

type AggFn = "count" | "sum" | "avg" | "min" | "max";

function aggregate(values: (number | null)[], fn: AggFn): number | null {
  const nums = values.filter(
    (v): v is number => v !== null && !Number.isNaN(v),
  );
  if (fn === "count") return values.length;
  if (nums.length === 0) return null;
  switch (fn) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
  }
}

// ─────────────────────────────────────────────
// メインの applyQuery 関数
// ─────────────────────────────────────────────

/**
 * 正規化済み行データに `WidgetQuery` を適用してグラフ描画用データを返す。
 *
 * @param rows - `fetchSheetTable` / normalize で得た行データ
 * @param query - `Widget.query`（Zod パース済み）
 * @returns グラフコンポーネントに渡す `QueryResult`
 */
export function applyQuery(
  rows: NormalizedRow[],
  query: WidgetQuery,
): QueryResult {
  const { groupByColumn, measures, filters, sorts, limit } = query;

  // 1. フィルタ適用
  let filtered = rows.filter((row) =>
    filters.every((f) => applyFilter(row, f)),
  );

  // 2. ソート適用（グルーピング前に適用）
  filtered = applySort(filtered, sorts);

  // 3. 件数制限（グルーピング前）
  if (limit !== undefined && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  // 集計列名（alias があれば alias、なければ "column_function"）
  const measureNames = measures.map(
    (m) => m.alias ?? `${m.column}_${m.function}`,
  );

  // 4. グルーピングなしの場合は全体を1行として返す
  if (!groupByColumn || measures.length === 0) {
    // グルーピング・集計なし: 生の行をそのまま QueryResult に変換して返す
    const noGroupRows: QueryResultRow[] = filtered.map((row) => {
      const key = groupByColumn ? String(row[groupByColumn] ?? "") : "_total";
      const values: Record<string, number | null> = {};
      for (const [i, m] of measures.entries()) {
        const name = measureNames[i] ?? `measure_${i}`;
        const raw = row[m.column];
        values[name] =
          raw !== null && raw !== undefined && !Number.isNaN(Number(raw))
            ? Number(raw)
            : null;
      }
      return { key, values };
    });

    return {
      groupByColumn,
      categories: noGroupRows.map((r) => r.key),
      rows: noGroupRows,
      measureNames,
    };
  }

  // 5. グルーピングあり: Map でグループ集計
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of filtered) {
    const key = String(row[groupByColumn] ?? "");
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const resultRows: QueryResultRow[] = [];
  for (const [key, groupRows] of groups) {
    const values: Record<string, number | null> = {};
    for (const [i, m] of measures.entries()) {
      const name = measureNames[i] ?? `measure_${i}`;
      const rawVals = groupRows.map((row) => {
        const v = row[m.column];
        if (v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
      });
      values[name] = aggregate(rawVals, m.function as AggFn);
    }
    resultRows.push({ key, values });
  }

  return {
    groupByColumn,
    categories: resultRows.map((r) => r.key),
    rows: resultRows,
    measureNames,
  };
}

// ─────────────────────────────────────────────
// NormalizedTable → NormalizedRow[] 変換
// ─────────────────────────────────────────────

/**
 * `lib/sheets/normalize` の `NormalizedTable`（string[][]）を
 * `applyQuery` が受け取れる `NormalizedRow[]` に変換する。
 *
 * - 数値型列は string → number に変換する。
 * - 空文字は null として扱う。
 * - `server-only` に依存しないため Vitest から安全に呼び出せる。
 */
export function tableToRows(params: {
  columns: { name: string; inferredType: string }[];
  rows: string[][];
}): NormalizedRow[] {
  const { columns, rows } = params;
  return rows.map((row) => {
    const mapped: NormalizedRow = {};
    for (const [i, col] of columns.entries()) {
      const cell = row[i] ?? "";
      if (cell === "") {
        mapped[col.name] = null;
      } else if (col.inferredType === "number") {
        // 桁区切りカンマ・通貨記号・% を除去して数値変換
        const stripped = cell.replace(/[¥$€,%\s]/g, "");
        const num = Number(stripped);
        mapped[col.name] = Number.isNaN(num) ? cell : num;
      } else {
        mapped[col.name] = cell;
      }
    }
    return mapped;
  });
}

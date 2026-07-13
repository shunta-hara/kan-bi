import type {
  ColumnDataType,
  InferredColumn,
  ParsedRange,
} from "@/lib/sheets/schema";
import {
  columnDataTypeSchema,
  type ColumnTypeOverrides,
} from "@/lib/sheets/schema";

/**
 * 取得した生データ（2次元配列の文字列）を正規化するロジック（仕様書 §5 FR-1 準拠）。
 *
 * - 1 行目をヘッダーとして扱う
 * - 列ごとに型推論（number / date / string）
 * - 空行・前後の余白をトリムする
 *
 * `server-only` / 外部 API クライアントに依存しない純粋関数のみを置き、
 * ユニットテストから直接検証できるようにする（[[feedback-server-only-testability]]）。
 */

const PREVIEW_ROW_LIMIT = 20;

export type NormalizedTable = {
  columns: InferredColumn[];
  rows: string[][];
  totalRowCount: number;
};

/**
 * 1 セルの文字列を正規化する（前後の空白をトリム）。
 * `null` / `undefined` は空文字列として扱う。
 */
function normalizeCell(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * 行が「空行」かどうかを判定する（すべてのセルが空文字列）。
 */
function isBlankRow(row: string[]): boolean {
  return row.every((cell) => normalizeCell(cell) === "");
}

// 数値判定: 桁区切りカンマ・前後の通貨記号や%を許容した上で、最終的に Number として解釈できるか確認する。
// （ロケール・表記揺れの完全対応は FEAT-004 の手動オーバーライドで補うため、ここでは代表的な表記のみ扱う）
const NUMBER_PATTERN =
  /^[+-]?[¥$€]?\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?%?$|^[+-]?[0-9]+(?:\.[0-9]+)?%?$/;

function looksLikeNumber(value: string): boolean {
  if (!NUMBER_PATTERN.test(value)) return false;
  const stripped = value.replace(/[¥$€,%\s]/g, "");
  if (stripped === "" || stripped === "+" || stripped === "-") return false;
  return Number.isFinite(Number(stripped));
}

// 日付判定: ISO 8601（YYYY-MM-DD[THH:mm:ss]）、スラッシュ区切り（YYYY/MM/DD, MM/DD/YYYY）に対応。
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
const SLASH_DATE_PATTERN = /^\d{1,4}\/\d{1,2}\/\d{1,4}$/;

function looksLikeDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value) && !SLASH_DATE_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

/**
 * 1 列の値群から型を推定する。
 * - 値がすべて空の列は "string" とする
 * - 非空の値がすべて number と解釈できれば "number"
 * - 非空の値がすべて date と解釈できれば "date"
 * - それ以外は "string"
 */
export function inferColumnType(values: string[]): ColumnDataType {
  const nonEmpty = values.map(normalizeCell).filter((value) => value !== "");
  if (nonEmpty.length === 0) return "string";

  if (nonEmpty.every(looksLikeNumber)) return "number";
  if (nonEmpty.every(looksLikeDate)) return "date";
  return "string";
}

/**
 * 生データ（ヘッダー行を含む2次元配列）を正規化する。
 *
 * - 先頭行をヘッダーとして取り出す
 * - 完全に空の行を除去する
 * - 各セルの前後の空白をトリムする
 * - 列ごとに型を推定する（`overrides` が指定されていればそちらを優先する＝ FEAT-004 用の土台）
 *
 * @param rawRows 取得した生データ（1行目=ヘッダー想定）
 * @param overrides 列名ごとの型オーバーライド（Sprint 2 では推定結果の表示までだが、
 *                  保存済みデータソースの再取得時に反映できるよう受け口を用意しておく）
 */
export function normalizeSheetTable(
  rawRows: string[][],
  overrides: ColumnTypeOverrides = {},
): NormalizedTable {
  if (rawRows.length === 0) {
    return { columns: [], rows: [], totalRowCount: 0 };
  }

  const trimmedRows = rawRows.map((row) => row.map(normalizeCell));
  const [headerRow, ...dataRows] = trimmedRows;

  // 余白行（完全に空の行）と gviz の集計行（先頭セルが "_total"）をトリムする
  const nonBlankDataRows = dataRows.filter(
    (row) => !isBlankRow(row) && normalizeCell(row[0]) !== "_total",
  );

  const columnCount = headerRow.length;
  const columnNames = headerRow.map((name, index) =>
    name === "" ? `Column ${index + 1}` : name,
  );

  const columns: InferredColumn[] = columnNames.map((name, columnIndex) => {
    const override = overrides[name];
    if (override && columnDataTypeSchema.safeParse(override).success) {
      return { name, inferredType: override };
    }
    const values = nonBlankDataRows.map((row) => row[columnIndex] ?? "");
    return { name, inferredType: inferColumnType(values) };
  });

  // 行の列数をヘッダーに合わせて揃える（不足は空文字で埋め、超過は切り詰める）
  const normalizedRows = nonBlankDataRows.map((row) => {
    const padded = [...row];
    while (padded.length < columnCount) padded.push("");
    return padded.slice(0, columnCount);
  });

  return {
    columns,
    rows: normalizedRows,
    totalRowCount: normalizedRows.length,
  };
}

/**
 * 正規化済みテーブルから登録前プレビュー用に先頭 N 行を切り出す。
 */
export function buildPreviewFromTable(table: NormalizedTable): {
  columns: InferredColumn[];
  rows: string[][];
  totalRowCount: number;
  truncated: boolean;
} {
  const rows = table.rows.slice(0, PREVIEW_ROW_LIMIT);
  return {
    columns: table.columns,
    rows,
    totalRowCount: table.totalRowCount,
    truncated: table.totalRowCount > rows.length,
  };
}

export { PREVIEW_ROW_LIMIT };
export type { ParsedRange };

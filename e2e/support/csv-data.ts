/**
 * E2E テスト用固定 CSV データ定数。
 *
 * fetch スタブ (fetch-stub.mjs) が返すデータと同一内容をここに定義し、
 * テスト側で期待値として参照できるようにする。
 *
 * 要件:
 * - ヘッダー行 + 最低 3 行のデータ
 * - 文字列列 (Name)・数値列 (Revenue)・日付列 (OrderDate) を各 1 列以上
 */

export const FIXED_CSV_HEADER = ["Name", "Revenue", "OrderDate"] as const;

export const FIXED_CSV_ROWS = [
  { Name: "Alice", Revenue: "1000", OrderDate: "2024-01-01" },
  { Name: "Bob", Revenue: "2000", OrderDate: "2024-01-02" },
  { Name: "Charlie", Revenue: "3000", OrderDate: "2024-01-03" },
] as const;

/** gviz CSV エンドポイントのスタブ用 Content-Type */
export const STUB_CONTENT_TYPE = "text/csv; charset=UTF-8";

/** スタブが使うダミースプレッドシート ID */
export const STUB_SPREADSHEET_ID = "stub-spreadsheet-id-e2e";

/** スタブが使うダミーレンジ */
export const STUB_RANGE = "Sheet1";

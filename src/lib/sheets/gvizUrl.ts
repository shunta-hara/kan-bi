import type { ParsedRange, SheetFetchErrorCode } from "@/lib/sheets/schema";

/**
 * 公開シート（gviz CSV）取得まわりの「純粋ロジック」だけを集めたモジュール。
 *
 * `publicSheetClient.ts`（`import "server-only"` を含み実際に `fetch` を行う）から
 * URL 構築・HTTP ステータス分類のロジックだけを切り出すことで、
 * 外部 I/O や `server-only` に依存せずユニットテストできるようにする
 * （[[feedback-server-only-testability]]: server-only モジュールは vitest で
 * import すると即座に例外を投げるため、純粋ロジックは依存のない sibling module に置く）。
 */

/**
 * `spreadsheetId` と解析済み `range` から gviz CSV エンドポイントの URL を構築する。
 * `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=...&range=...`
 */
export function buildGvizCsvUrl(
  spreadsheetId: string,
  range: ParsedRange,
): string {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`,
  );
  url.searchParams.set("tqx", "out:csv");
  if (range.sheetName) {
    url.searchParams.set("sheet", range.sheetName);
  }
  if (range.cellRange) {
    url.searchParams.set("range", range.cellRange);
  }
  return url.toString();
}

export type GvizHttpClassification = {
  code: SheetFetchErrorCode;
  message: string;
} | null;

/**
 * gviz エンドポイントからの HTTP レスポンスステータスを `SheetFetchErrorCode` に分類する。
 * 正常（200 系）の場合は `null` を返す（呼び出し側で Content-Type / 本文の検証を続ける）。
 */
export function classifyGvizHttpStatus(status: number): GvizHttpClassification {
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message:
        "The spreadsheet was not found. Check the URL and that the sheet still exists.",
    };
  }

  if (status === 400) {
    return {
      code: "INVALID_RANGE",
      message:
        "The specified range or sheet name could not be resolved by the spreadsheet.",
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "FORBIDDEN",
      message:
        "Access to the spreadsheet was denied. Make sure it is shared as “Anyone with the link can view” or published to the web, or register it with Google account access instead.",
    };
  }

  if (status < 200 || status >= 300) {
    return {
      code: "UNKNOWN",
      message: `The spreadsheet could not be fetched (HTTP ${status}).`,
    };
  }

  return null;
}

/**
 * `Content-Type` ヘッダーから「公開 CSV を返しているか」を判定する。
 * gviz は非公開シートに対しても 200 + HTML（ログインページ）を返すことがあるため、
 * ステータスコードだけでなく Content-Type でも公開シートかどうかを確認する。
 */
export function isCsvContentType(contentType: string): boolean {
  return contentType.includes("text/csv") || contentType.includes("text/plain");
}

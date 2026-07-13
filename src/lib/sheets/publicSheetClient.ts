import "server-only";

import { parseCsv } from "@/lib/sheets/csv";
import type { ParsedRange } from "@/lib/sheets/schema";
import { SheetFetchError } from "@/lib/sheets/errors";
import {
  buildGvizCsvUrl,
  classifyGvizHttpStatus,
  isCsvContentType,
} from "@/lib/sheets/gvizUrl";

/**
 * 公開シート（gviz CSV エンドポイント）からのデータ取得（仕様書 §5 FR-1 副方式）。
 *
 * - Google スプレッドシートが「リンクを知っている全員が閲覧可」または「ウェブに公開」
 *   設定の場合、`https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv` で
 *   認証なしに CSV を取得できる。
 * - サーバー側でのみ実行する（`import "server-only"`）。クライアントに URL や
 *   レスポンスを直接渡さない。
 * - URL 構築・HTTP ステータス分類などの純粋ロジックは `gvizUrl.ts` に切り出してあり、
 *   ここでは実際の `fetch` 呼び出しと例外への変換のみを行う
 *   （[[feedback-server-only-testability]]）。
 */

const GVIZ_TIMEOUT_MS = 15_000;

/**
 * gviz CSV エンドポイントから生データ（2次元文字列配列）を取得する。
 *
 * 取得・解析の失敗は原因が分かるよう {@link SheetFetchError} に分類して送出する
 * （仕様書 FEAT-002 受け入れ基準「取得や読み込みに失敗した場合、原因が分かる形で
 * エラーが表示される」に対応）。
 */
export async function fetchPublicSheetRows(
  spreadsheetId: string,
  range: ParsedRange,
): Promise<string[][]> {
  const url = buildGvizCsvUrl(spreadsheetId, range);

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GVIZ_TIMEOUT_MS);
    try {
      response = await fetch(url, {
        signal: controller.signal,
        // gviz は Cookie なしでも公開シートを返す。サーバー間通信のためキャッシュしない。
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    throw new SheetFetchError(
      "NETWORK_ERROR",
      "Failed to reach the spreadsheet (network error or timeout).",
      { cause: error },
    );
  }

  const classification = classifyGvizHttpStatus(response.status);
  if (classification) {
    throw new SheetFetchError(classification.code, classification.message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!isCsvContentType(contentType)) {
    throw new SheetFetchError(
      "FORBIDDEN",
      "The spreadsheet does not appear to be publicly accessible. Make sure it is shared as “Anyone with the link can view” or published to the web.",
    );
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new SheetFetchError(
      "EMPTY_RESULT",
      "The spreadsheet returned no data for the specified range.",
    );
  }

  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    throw new SheetFetchError(
      "PARSE_ERROR",
      "Failed to parse the spreadsheet response as CSV.",
      { cause: error },
    );
  }

  if (rows.length === 0) {
    throw new SheetFetchError(
      "EMPTY_RESULT",
      "The spreadsheet returned no data for the specified range.",
    );
  }

  return rows;
}

export { buildGvizCsvUrl };

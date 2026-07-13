import "server-only";

import type { AuthMode, ColumnTypeOverrides } from "@/lib/sheets/schema";
import { parseRange } from "@/lib/sheets/schema";
import { SheetFetchError, toSheetFetchError } from "@/lib/sheets/errors";
import { fetchPublicSheetRows } from "@/lib/sheets/publicSheetClient";
import { fetchOAuthSheetRows } from "@/lib/sheets/oauthSheetClient";
import {
  buildPreviewFromTable,
  normalizeSheetTable,
  type NormalizedTable,
} from "@/lib/sheets/normalize";

/**
 * `authMode` に応じて適切な取得経路（OAuth / 公開シート）を選び、
 * 取得結果を正規化するオーケストレーション層。
 *
 * - `lib/sheets/` 配下の各クライアント（取得）と正規化ロジックを組み合わせる責務のみを持ち、
 *   Route Handler 側からはこのモジュールだけを呼び出せばよいようにする
 *   （.claude/rules/architecture.md: 「lib/ 配下はレイヤー単位で完結させ、相互に直接依存させない」）。
 */

export type FetchSheetTableParams = {
  userId: string;
  spreadsheetId: string;
  range: string;
  authMode: AuthMode;
  columnTypeOverrides?: ColumnTypeOverrides;
};

/**
 * 入力の `range` 文字列を解析し、取得・正規化を行う。
 * `range` の形式が不正な場合は `INVALID_RANGE` として `SheetFetchError` を投げる
 * （`rangeSchema` で事前検証している前提だが、防御的に再チェックする）。
 */
export async function fetchAndNormalizeSheetTable(
  params: FetchSheetTableParams,
): Promise<NormalizedTable> {
  const { userId, spreadsheetId, range, authMode, columnTypeOverrides } =
    params;

  const parsedRange = parseRange(range);
  if (!parsedRange) {
    throw new SheetFetchError(
      "INVALID_RANGE",
      'range must look like "Sheet1!A1:F100", "Sheet1", or "A1:F100"',
    );
  }

  let rawRows: string[][];
  try {
    rawRows =
      authMode === "OAUTH"
        ? await fetchOAuthSheetRows(userId, spreadsheetId, parsedRange)
        : await fetchPublicSheetRows(spreadsheetId, parsedRange);
  } catch (error) {
    throw toSheetFetchError(error);
  }

  return normalizeSheetTable(rawRows, columnTypeOverrides ?? {});
}

/**
 * 登録前プレビュー用のショートカット。正規化済みテーブルから
 * 先頭 N 行・列名・推定型・件数・切り詰め有無のプレビュー情報を返す
 * （仕様書 FEAT-002「登録前に先頭数行のプレビューと、各列の名称・推定された型を確認できる」）。
 */
export async function fetchSheetPreview(params: FetchSheetTableParams) {
  const table = await fetchAndNormalizeSheetTable(params);
  return buildPreviewFromTable(table);
}

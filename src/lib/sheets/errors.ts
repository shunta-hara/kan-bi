import {
  sheetFetchErrorCodeSchema,
  type SheetFetchErrorCode,
} from "@/lib/sheets/schema";

/**
 * シート取得・解析時の「原因が分かるエラー」を表す例外クラス。
 *
 * 仕様書 FEAT-002 受け入れ基準「取得や読み込みに失敗した場合、原因が分かる形で
 * エラーが表示される」に対応するため、ユーザー向けに表示してよい説明文 (`message`)
 * と、UI 側でハンドリング・i18n するための機械可読な `code` を分離して保持する。
 *
 * 外部 API クライアント（`server-only`）に依存しない純粋なクラスなので、
 * ユニットテストから直接検証できる（[[feedback-server-only-testability]]）。
 */
export class SheetFetchError extends Error {
  readonly code: SheetFetchErrorCode;

  constructor(
    code: SheetFetchErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SheetFetchError";
    this.code = sheetFetchErrorCodeSchema.parse(code);
  }
}

export function isSheetFetchError(error: unknown): error is SheetFetchError {
  return error instanceof SheetFetchError;
}

/**
 * 任意の例外を `SheetFetchError` に正規化する。
 * 想定外の例外（型推論失敗・予期しない実行時エラーなど）は `UNKNOWN` として扱い、
 * 「原因不明のまま静かに失敗する」ことを避ける。
 */
export function toSheetFetchError(error: unknown): SheetFetchError {
  if (isSheetFetchError(error)) return error;
  if (error instanceof Error) {
    return new SheetFetchError("UNKNOWN", error.message, { cause: error });
  }
  return new SheetFetchError(
    "UNKNOWN",
    "An unknown error occurred while fetching the spreadsheet.",
  );
}

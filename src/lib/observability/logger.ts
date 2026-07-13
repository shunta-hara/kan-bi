/**
 * 構造化ログおよび Sentry 連携の抽象レイヤー（FEAT-BF-007）。
 *
 * - `server-only` を付けないことでユニットテストから直接検証できる。
 *   （[[server-only modules untestable in vitest]]）
 * - Sentry は未インストールのため、現在は安全な no-op 関数を提供する。
 *   `@sentry/nextjs` 導入後は `captureServerException` 内で Sentry を呼び出す。
 */

export type WidgetFetchErrorLogEntry = {
  event: "widget_data_fetch_error";
  widgetId: string;
  dataSourceId: string;
  errorCode: string;
  errorMessage: string;
  timestamp: string;
};

/**
 * ウィジェットデータ取得失敗を構造化ログ（JSON）として記録する。
 *
 * FEAT-BF-007 受け入れ基準:
 * - エラーコード・`dataSourceId`・`widgetId` を含む構造化ログが出力される
 * - Sentry にエラーレポートが送信される（現在は no-op）
 */
export function logWidgetFetchError(params: {
  widgetId: string;
  dataSourceId: string;
  errorCode: string;
  errorMessage: string;
}): void {
  const entry: WidgetFetchErrorLogEntry = {
    event: "widget_data_fetch_error",
    widgetId: params.widgetId,
    dataSourceId: params.dataSourceId,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(entry));
  captureServerException(new Error(params.errorMessage), {
    widgetId: params.widgetId,
    dataSourceId: params.dataSourceId,
    errorCode: params.errorCode,
  });
}

/**
 * Sentry にエラーレポートを送信する。
 * `@sentry/nextjs` が導入されるまでは no-op として動作する。
 *
 * 導入後の移行例:
 * ```ts
 * import * as Sentry from "@sentry/nextjs";
 * Sentry.captureException(error, { extra: context });
 * ```
 */
function captureServerException(
  _error: Error,
  _context: Record<string, string>,
): void {
  // no-op: Sentry 未導入のため何もしない
}

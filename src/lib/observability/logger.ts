/**
 * 構造化ログおよび Sentry 連携の抽象レイヤー（FEAT-BF-007, FEAT-SEN-005）。
 *
 * - `server-only` を付けないことでユニットテストから直接検証できる。
 *   （[[server-only modules untestable in vitest]]）
 * - `@sentry/nextjs` は動的 import で呼び出し、かつ DSN が設定されているときのみ import する。
 *   理由: logger.ts は多数のサーバールートから import されるため、静的 import にすると
 *   dev コンパイル時にすべてのルートが @sentry/nextjs の 1000+ モジュールを引き込み、
 *   初回コンパイル時間が大幅に増加する。DSN ガードにより、ローカル開発・テスト環境では
 *   @sentry/nextjs が実行時にもロードされず、無駄な module resolution を防ぐ。
 *   `captureServerException` は fire-and-forget で呼ばれるため非同期化しても呼び出し側に影響しない。
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
 * - Sentry にエラーレポートが送信される（FEAT-SEN-005）
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
 * `@sentry/nextjs` の読み込みを 1 回に共有する。
 * 呼び出しごとに `import()` すると、同じ tick で続けて呼ばれたとき（モック環境）に 2 回目以降が
 * 解決されず、後続の `catch` に握りつぶされて送信が静かに失われる。
 */
let sentryModulePromise: Promise<typeof import("@sentry/nextjs")> | undefined;

function loadSentry(): Promise<typeof import("@sentry/nextjs")> {
  sentryModulePromise ??= import("@sentry/nextjs");
  return sentryModulePromise;
}

/**
 * Sentry にエラーレポートを送信する（FEAT-SEN-005）。
 *
 * - `REAUTH_REQUIRED` のようなユーザー起因の想定内エラーは `level: "warning"` で送信し、
 *   それ以外の障害は `level: "error"` で送信する（ノイズ抑制）。
 * - タグには `errorCode` / `dataSourceId` / `widgetId` のみ含める。
 *   メールアドレス・userId などの個人情報は含めない。
 * - DSN が未設定の場合は Sentry が初期化されておらず no-op となる。
 * - fire-and-forget: 非同期で送信し、呼び出し元をブロックしない。
 *
 * @param error 送信するエラー（Error 以外の値でもよい。関数内で Error に正規化する）
 * @param context タグとして付与するコンテキスト情報
 */
export function captureServerException(
  error: unknown,
  context: {
    errorCode?: string;
    dataSourceId?: string;
    widgetId?: string;
  },
): void {
  // DSN が未設定なら @sentry/nextjs を一切 import しない（dev/test での無駄なロードを防ぐ）。
  if (!process.env.SENTRY_DSN?.trim()) return;

  const level = context.errorCode === "REAUTH_REQUIRED" ? "warning" : "error";
  // catch 句の値は Error とは限らない。呼び出し側で正規化させず、ここで Error に揃える。
  const exception = error instanceof Error ? error : new Error(String(error));

  void loadSentry()
    .then(({ captureException }) => {
      captureException(exception, {
        level,
        tags: {
          ...(context.errorCode != null && { errorCode: context.errorCode }),
          ...(context.dataSourceId != null && {
            dataSourceId: context.dataSourceId,
          }),
          ...(context.widgetId != null && { widgetId: context.widgetId }),
        },
      });
    })
    .catch(() => {
      // SDK 未初期化または失敗 → 無視
    });
}

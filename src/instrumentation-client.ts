/**
 * Next.js ブラウザ向け instrumentation エントリポイント（FEAT-SEN-001）。
 *
 * `NEXT_PUBLIC_SENTRY_DSN` が設定されている場合のみ Sentry を動的 import して初期化する。
 * DSN が未設定のとき（ビルド時に空文字に置換）、`import("@sentry/nextjs")` は
 * デッドコードとして除去され、Sentry SDK がクライアントバンドルに含まれない。
 */

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void (async () => {
    try {
      const [{ init }, { buildBrowserSentryOptions }] = await Promise.all([
        import("@sentry/nextjs"),
        import("@/lib/observability/sentryOptions"),
      ]);
      const options = buildBrowserSentryOptions({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      });
      if (options.shouldInit) {
        init(options);
      }
    } catch (err) {
      console.error("[sentry] Failed to initialize Sentry (browser)", err);
    }
  })();
}

/**
 * Next.js instrumentation エントリポイント（FEAT-SEN-001, FEAT-SEN-002）。
 *
 * - `register()`: Node.js ランタイムのみで Sentry を初期化する。
 *   DSN が未設定の場合はスキップし、no-op 状態を維持する。
 * - `onRequestError`: Route Handler・Server Component・Server Action の
 *   未処理例外を自動的に Sentry へ送信する（FEAT-SEN-002）。
 *
 * ## Node.js ランタイム限定にする理由
 * `instrumentation.ts` は Next.js により Node.js と Edge の両ランタイム向けに
 * それぞれコンパイルされる（`edge-instrumentation.js`）。
 * `process.env.NEXT_RUNTIME` はビルド時に定数置換されるため、
 * `=== "nodejs"` ガードを設ければ Edge コンパイル時に dead code elimination され
 * `@sentry/nextjs` が edge バンドルに含まれない。
 * Edge ランタイム（middleware）で @sentry/nextjs を初期化する必要はない:
 * middleware はセッション判定のみを行い、Sentry へのエラー送信を行わない。
 * Route Handler / Server Action のエラー捕捉は Node.js ランタイムで十分。
 *
 * 初期化コードは try-catch で保護し、SDK の失敗でアプリが落ちないようにする。
 */

export async function register(): Promise<void> {
  // process.env.NEXT_RUNTIME はビルド時定数置換されるため、
  // Edge コンパイルでは if("edge" === "nodejs") → false → dead code elimination。
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // DSN が未設定なら @sentry/nextjs を一切 import しない。
    // これにより dev の初回コンパイル時に @sentry/nextjs の 1000+ モジュールを
    // トラバースしなくなり、ローカル開発・テスト・E2E での無駄なロードを防ぐ。
    if (!process.env.SENTRY_DSN?.trim()) return;
    try {
      const [{ init }, { buildSentryOptions }] = await Promise.all([
        import("@sentry/nextjs"),
        import("@/lib/observability/sentryOptions"),
      ]);
      const options = buildSentryOptions({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT,
        release: process.env.SENTRY_RELEASE,
      });
      if (options.shouldInit) {
        init(options);
      }
    } catch (err) {
      console.error("[sentry] Failed to initialize Sentry (nodejs)", err);
    }
  }
}

/**
 * Next.js が Route Handler / Server Component / Server Action の未処理例外を
 * このフックに渡すことで、自動的に Sentry へ送信される（FEAT-SEN-002）。
 * DSN 未設定時は Sentry が初期化されていないため、実質 no-op となる。
 *
 * Node.js ランタイム限定ガードを設けることで、Edge コンパイル時に
 * `import("@sentry/nextjs")` が dead code elimination され edge バンドルに混入しない。
 */
export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
): Promise<void> {
  // Edge コンパイルでは if("edge" === "edge") → true → return → dead code elimination。
  // Node.js（"nodejs"）およびテスト環境（undefined）では通過する。
  if (process.env.NEXT_RUNTIME === "edge") return;
  // DSN が未設定なら @sentry/nextjs を一切 import しない。
  if (!process.env.SENTRY_DSN?.trim()) return;
  try {
    const { captureRequestError } = await import("@sentry/nextjs");
    captureRequestError(...args);
  } catch {
    // SDK 未初期化または失敗 → 無視
  }
}

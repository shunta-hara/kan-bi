/**
 * クライアントサイドのエラーを Sentry に送信する軽量ヘルパー（FEAT-SEN-003）。
 *
 * `NEXT_PUBLIC_SENTRY_DSN` が設定されている場合のみ、`@sentry/nextjs` を
 * 動的 import して `captureException` を呼び出す。
 * DSN が未設定（ビルド時に空文字に置換される）の場合、動的 import は
 * デッドコードとして除去され、Sentry SDK がクライアントバンドルに含まれない。
 *
 * `server-only` を付けないこと（クライアントコンポーネントから呼ばれるため）。
 */

export async function reportClientError(error: Error): Promise<void> {
  // NEXT_PUBLIC_* 変数はビルド時に値が埋め込まれる。
  // DSN 未設定なら空文字になるため、以下の if ブロック（内部の動的 import を含む）は
  // ビルド時にデッドコード除去され、Sentry SDK がバンドルに含まれない。
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }
  try {
    const { captureException } = await import("@sentry/nextjs");
    captureException(error);
  } catch {
    // SDK の失敗でアプリがクラッシュしないよう握りつぶす
  }
}

/**
 * 環境変数から Sentry 初期化オプションを組み立てる純粋関数（FEAT-SEN-001）。
 *
 * - `server-only` を付けないことでユニットテストから直接検証できる。
 * - DSN が未設定（空文字・undefined）の場合は `shouldInit: false` を返す。
 *
 * ## `sendDefaultPii` について（Sentry v11 調査結果）
 * `sendDefaultPii` は `@sentry/core` v11.9.0 の `Options` 型定義
 * （`node_modules/.pnpm/@sentry+core@11.9.0/.../types/options.d.ts`）に存在しない。
 * `@sentry/node` v11 の `NodeOptions` にも存在しない。
 * v11 では `RequestData` 統合が `include.cookies` / `include.ip` を個別に制御する形に変わった。
 * 既定では `include.cookies` は `dataCollection.cookies !== false` で有効になるため、
 * Cookie は `RequestData` 統合によってイベントに付加され得る。
 * そのため `beforeSend` フックで `scrubSentryEvent` を通すことが PII 除去の主たる手段。
 */

import type { NodeOptions } from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/scrubSentryEvent";

export type SentryInitOptions = NodeOptions & {
  /** DSN が設定されており初期化すべきかどうか */
  shouldInit: boolean;
};

/**
 * サーバー / Edge 向けの Sentry 初期化オプションを組み立てる。
 *
 * @param env 環境変数（テスト時は任意の値を渡せる）
 */
export function buildSentryOptions(env: {
  dsn: string | undefined;
  environment: string | undefined;
  release: string | undefined;
}): SentryInitOptions {
  const dsn = env.dsn?.trim();
  const shouldInit = Boolean(dsn);

  if (!shouldInit) {
    return { shouldInit: false, enabled: false };
  }

  const options: SentryInitOptions = {
    shouldInit: true,
    dsn,
    enabled: true,
    tracesSampleRate: 0,
    beforeSend(event: ErrorEvent): ErrorEvent {
      return scrubSentryEvent(event) as ErrorEvent;
    },
  };

  if (env.environment?.trim()) {
    options.environment = env.environment.trim();
  }

  if (env.release?.trim()) {
    options.release = env.release.trim();
  }

  return options;
}

/**
 * ブラウザ向けの Sentry 初期化オプションを組み立てる（FEAT-SEN-001）。
 * NEXT_PUBLIC_ プレフィックス変数はブラウザに公開されるため、別系統の DSN を使う。
 *
 * @param env 環境変数（テスト時は任意の値を渡せる）
 */
export function buildBrowserSentryOptions(env: {
  dsn: string | undefined;
  environment: string | undefined;
  release: string | undefined;
}): SentryInitOptions {
  // ブラウザ側でも同じロジックを使う（DSN の変数名のみ異なる）
  return buildSentryOptions(env);
}

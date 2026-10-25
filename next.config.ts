import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * `@sentry/nextjs` および関連 OpenTelemetry パッケージをバンドルから除外し、
   * Node.js 実行時に `node_modules` から読み込む。
   *
   * A/B 計測結果（DSN なし / dynamic import 適用後）:
   *   なし: `/` 22.1s / 3321 modules、`/dashboards/[id]` 12.8s / 4864 modules
   *   あり: `/` 6.1s / 1371 modules、`/dashboards/[id]` 4.8s / 2919 modules
   * dev 初回コンパイル時間を約 60-70 % 短縮できるため採用する。
   *
   * DSN が未設定のとき（ローカル開発・テスト）はこれらのモジュールは実行時ロードもされない
   * （instrumentation.ts / logger.ts の DSN ガードによる）。
   */
  serverExternalPackages: [
    "@sentry/nextjs",
    "@sentry/node",
    "@sentry/core",
    "@sentry/opentelemetry",
    "@opentelemetry/api",
    "@opentelemetry/context-async-hooks",
    "@opentelemetry/core",
    "@opentelemetry/instrumentation",
    "@opentelemetry/resources",
    "@opentelemetry/sdk-trace-base",
    "@opentelemetry/semantic-conventions",
  ],
};

export default withNextIntl(nextConfig);

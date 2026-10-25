import { describe, expect, it } from "vitest";

import {
  buildSentryOptions,
  buildBrowserSentryOptions,
} from "@/lib/observability/sentryOptions";

describe("buildSentryOptions", () => {
  it("正常系: DSN が設定されている場合 shouldInit=true を返す", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: "production",
      release: "abc123",
    });
    expect(result.shouldInit).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.dsn).toBe("https://key@sentry.example.com/123");
  });

  it("正常系: environment が設定されている場合 options.environment に含まれる", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: "staging",
      release: undefined,
    });
    expect(result.environment).toBe("staging");
  });

  it("正常系: release が設定されている場合 options.release に含まれる", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: undefined,
      release: "v1.2.3",
    });
    expect(result.release).toBe("v1.2.3");
  });

  it("正常系: beforeSend が設定される（個人情報フィルタリング用）", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: undefined,
      release: undefined,
    });
    expect(typeof result.beforeSend).toBe("function");
  });

  it("正常系: beforeSend がリクエストヘッダーの cookie を除去する", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: undefined,
      release: undefined,
    });
    const filtered = result.beforeSend?.(
      {
        type: undefined,
        request: {
          headers: { cookie: "session=abc", "x-request-id": "req-1" },
        },
      },
      {},
    );
    if (filtered && typeof filtered === "object" && "request" in filtered) {
      const headers = (
        filtered as { request?: { headers?: Record<string, unknown> } }
      ).request?.headers;
      expect(headers).not.toHaveProperty("cookie");
      expect(headers).toHaveProperty("x-request-id");
    }
  });

  it("正常系: tracesSampleRate が 0 に設定される", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: undefined,
      release: undefined,
    });
    expect(result.tracesSampleRate).toBe(0);
  });

  it("異常系: DSN が undefined の場合 shouldInit=false を返す", () => {
    const result = buildSentryOptions({
      dsn: undefined,
      environment: "production",
      release: "abc",
    });
    expect(result.shouldInit).toBe(false);
    expect(result.enabled).toBe(false);
  });

  it("境界値: DSN が空文字の場合 shouldInit=false を返す", () => {
    const result = buildSentryOptions({
      dsn: "",
      environment: "production",
      release: "abc",
    });
    expect(result.shouldInit).toBe(false);
  });

  it("境界値: DSN がスペースのみの場合 shouldInit=false を返す", () => {
    const result = buildSentryOptions({
      dsn: "   ",
      environment: undefined,
      release: undefined,
    });
    expect(result.shouldInit).toBe(false);
  });

  it("境界値: environment が空文字の場合 options.environment を設定しない", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: "",
      release: undefined,
    });
    expect(result.environment).toBeUndefined();
  });

  it("境界値: release が空文字の場合 options.release を設定しない", () => {
    const result = buildSentryOptions({
      dsn: "https://key@sentry.example.com/123",
      environment: undefined,
      release: "",
    });
    expect(result.release).toBeUndefined();
  });
});

describe("buildBrowserSentryOptions", () => {
  it("正常系: NEXT_PUBLIC_SENTRY_DSN が設定されている場合 shouldInit=true を返す", () => {
    const result = buildBrowserSentryOptions({
      dsn: "https://pubkey@sentry.example.com/456",
      environment: "production",
      release: "v2.0.0",
    });
    expect(result.shouldInit).toBe(true);
    expect(result.dsn).toBe("https://pubkey@sentry.example.com/456");
  });

  it("正常系: DSN が未設定の場合 shouldInit=false を返す（ブラウザ向け確認）", () => {
    const result = buildBrowserSentryOptions({
      dsn: undefined,
      environment: undefined,
      release: undefined,
    });
    expect(result.shouldInit).toBe(false);
  });
});

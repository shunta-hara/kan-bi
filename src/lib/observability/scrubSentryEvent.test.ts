import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "@/lib/observability/scrubSentryEvent";

describe("scrubSentryEvent", () => {
  // --- 境界値: null/undefined/空イベント ---

  it("境界値: null を渡しても例外をスローせず空オブジェクトを返す", () => {
    expect(() => scrubSentryEvent(null)).not.toThrow();
    expect(scrubSentryEvent(null)).toEqual({});
  });

  it("境界値: undefined を渡しても例外をスローせず空オブジェクトを返す", () => {
    expect(() => scrubSentryEvent(undefined)).not.toThrow();
    expect(scrubSentryEvent(undefined)).toEqual({});
  });

  it("境界値: 空オブジェクトを渡しても例外をスローしない", () => {
    expect(() => scrubSentryEvent({})).not.toThrow();
    expect(scrubSentryEvent({})).toEqual({});
  });

  it("境界値: headers のないリクエストを渡してもクラッシュしない", () => {
    expect(() => scrubSentryEvent({ request: {} })).not.toThrow();
  });

  // --- イベントを破棄しない ---

  it("正常系: イベントを破棄しない（null を返さない）", () => {
    const result = scrubSentryEvent({
      message: "test error",
      request: {
        headers: { cookie: "session=abc" },
      },
    });
    expect(result).not.toBeNull();
    expect(result.message).toBe("test error");
  });

  // --- ヘッダー除去 ---

  it("正常系: cookie ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          cookie: "session=abc",
          "content-type": "application/json",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("cookie");
    expect(result.request?.headers).toHaveProperty(
      "content-type",
      "application/json",
    );
  });

  it("正常系: authorization ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          authorization: "Bearer token123",
          accept: "application/json",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("authorization");
    expect(result.request?.headers).toHaveProperty(
      "accept",
      "application/json",
    );
  });

  it("正常系: x-pdf-token ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          "x-pdf-token": "secret-pdf-token",
          host: "example.com",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("x-pdf-token");
    expect(result.request?.headers).toHaveProperty("host", "example.com");
  });

  it("正常系: set-cookie ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          "set-cookie": "session=abc; HttpOnly",
          "content-type": "text/html",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("set-cookie");
    expect(result.request?.headers).toHaveProperty("content-type");
  });

  it("正常系: proxy-authorization ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          "proxy-authorization": "Basic abc",
          host: "proxy.example.com",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("proxy-authorization");
    expect(result.request?.headers).toHaveProperty("host");
  });

  it("正常系: x-forwarded-for ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          "x-forwarded-for": "192.168.1.1, 10.0.0.1",
          "x-request-id": "req-1",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("x-forwarded-for");
    expect(result.request?.headers).toHaveProperty("x-request-id");
  });

  it("正常系: x-real-ip ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: { "x-real-ip": "1.2.3.4", host: "example.com" },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("x-real-ip");
  });

  it("正常系: x-vercel-forwarded-for ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: { "x-vercel-forwarded-for": "5.6.7.8" },
      },
    });
    expect(result.request?.headers).not.toHaveProperty(
      "x-vercel-forwarded-for",
    );
  });

  it("正常系: cf-connecting-ip ヘッダーを除去する", () => {
    const result = scrubSentryEvent({
      request: {
        headers: { "cf-connecting-ip": "9.10.11.12" },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("cf-connecting-ip");
  });

  it("境界値: Cookie（大文字）ヘッダーも除去する（大小文字問わない）", () => {
    const result = scrubSentryEvent({
      request: {
        headers: {
          Cookie: "session=abc",
          Authorization: "Bearer token",
          "X-Pdf-Token": "token",
          "X-Forwarded-For": "1.2.3.4",
          "Set-Cookie": "sid=x",
        },
      },
    });
    expect(result.request?.headers).not.toHaveProperty("Cookie");
    expect(result.request?.headers).not.toHaveProperty("Authorization");
    expect(result.request?.headers).not.toHaveProperty("X-Pdf-Token");
    expect(result.request?.headers).not.toHaveProperty("X-Forwarded-For");
    expect(result.request?.headers).not.toHaveProperty("Set-Cookie");
  });

  // --- request.cookies 除去 ---

  it("正常系: request.cookies を除去する（ヘッダーとは別フィールド）", () => {
    const result = scrubSentryEvent({
      request: {
        url: "/api/test",
        cookies: { session: "abc123", theme: "dark" },
      },
    });
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.url).toBe("/api/test");
  });

  it("境界値: request.cookies が undefined のとき何も壊れない", () => {
    const result = scrubSentryEvent({
      request: { url: "/api/test" },
    });
    expect(result.request?.cookies).toBeUndefined();
  });

  // --- request.query_string 除去 ---

  it("正常系: request.query_string を除去する（OAuth code/state が含まれ得る）", () => {
    const result = scrubSentryEvent({
      request: {
        url: "/api/auth/callback/google",
        query_string: "code=abc123&state=xyz",
      },
    });
    expect(result.request?.query_string).toBeUndefined();
  });

  it("境界値: request.query_string が undefined のとき何も壊れない", () => {
    expect(() =>
      scrubSentryEvent({ request: { url: "/api/test" } }),
    ).not.toThrow();
  });

  // --- request.url のクエリ除去 ---

  it("正常系: request.url のクエリ文字列を除去してパスのみ残す", () => {
    const result = scrubSentryEvent({
      request: {
        url: "https://example.com/api/auth/callback?code=abc&state=xyz",
      },
    });
    expect(result.request?.url).toBe("https://example.com/api/auth/callback");
    expect(result.request?.url).not.toContain("?");
    expect(result.request?.url).not.toContain("code=");
  });

  it("正常系: request.url のフラグメントを除去する", () => {
    const result = scrubSentryEvent({
      request: { url: "https://example.com/page#section" },
    });
    expect(result.request?.url).toBe("https://example.com/page");
  });

  it("境界値: 不正な URL でも例外をスローしない", () => {
    expect(() =>
      scrubSentryEvent({
        request: { url: "/relative/path?foo=bar" },
      }),
    ).not.toThrow();
    const result = scrubSentryEvent({
      request: { url: "/relative/path?foo=bar" },
    });
    expect(result.request?.url).toBe("/relative/path");
  });

  it("境界値: クエリのない URL はそのまま返す", () => {
    const result = scrubSentryEvent({
      request: { url: "https://example.com/dashboard" },
    });
    expect(result.request?.url).toBe("https://example.com/dashboard");
  });

  // --- ユーザー情報除去 ---

  it("正常系: user.email を除去する", () => {
    const result = scrubSentryEvent({
      user: { id: "user-123", email: "user@example.com" },
    });
    expect(result.user).not.toHaveProperty("email");
    expect(result.user?.id).toBe("user-123");
  });

  it("正常系: user.ip_address を除去する", () => {
    const result = scrubSentryEvent({
      user: { id: "user-123", ip_address: "192.168.0.1" },
    });
    expect(result.user).not.toHaveProperty("ip_address");
    expect(result.user?.id).toBe("user-123");
  });

  it("正常系: user.email と user.ip_address を同時に除去する", () => {
    const result = scrubSentryEvent({
      user: {
        id: "user-123",
        email: "user@example.com",
        ip_address: "10.0.0.1",
      },
    });
    expect(result.user).not.toHaveProperty("email");
    expect(result.user).not.toHaveProperty("ip_address");
    expect(result.user?.id).toBe("user-123");
  });

  it("境界値: user が email/ip_address のみの場合、user が undefined になる", () => {
    const result = scrubSentryEvent({
      user: { email: "user@example.com", ip_address: "10.0.0.1" },
    });
    expect(result.user).toBeUndefined();
  });

  // --- リクエストボディ除去 ---

  it("正常系: request.data（ボディ）を除去する", () => {
    const result = scrubSentryEvent({
      request: {
        url: "https://example.com/api",
        data: '{"password":"secret"}',
      },
    });
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.url).toBe("https://example.com/api");
  });

  // --- 複合テスト ---

  it("正常系: 複数の個人情報を同時に除去する", () => {
    const result = scrubSentryEvent({
      message: "server error",
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
      request: {
        url: "https://example.com/api/test?secret=123",
        headers: {
          cookie: "s=x",
          authorization: "Bearer y",
          "x-pdf-token": "z",
          "x-forwarded-for": "1.2.3.4",
          "x-request-id": "req-1",
        },
        cookies: { session: "abc" },
        query_string: "secret=123",
        data: "body content",
      },
    });

    expect(result.message).toBe("server error");
    expect(result.user?.id).toBe("u1");
    expect(result.user).not.toHaveProperty("email");
    expect(result.user).not.toHaveProperty("ip_address");
    expect(result.request?.headers).not.toHaveProperty("cookie");
    expect(result.request?.headers).not.toHaveProperty("authorization");
    expect(result.request?.headers).not.toHaveProperty("x-pdf-token");
    expect(result.request?.headers).not.toHaveProperty("x-forwarded-for");
    expect(result.request?.headers).toHaveProperty("x-request-id", "req-1");
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();
    expect(result.request?.url).toBe("https://example.com/api/test");
    expect(result.request?.data).toBeUndefined();
  });
});

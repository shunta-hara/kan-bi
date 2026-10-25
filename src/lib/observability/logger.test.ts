import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";

import {
  logWidgetFetchError,
  captureServerException,
  type WidgetFetchErrorLogEntry,
} from "@/lib/observability/logger";

describe("logWidgetFetchError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("正常系: 必要なフィールドを含む構造化 JSON を console.error に出力する", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWidgetFetchError({
      widgetId: "widget-001",
      dataSourceId: "ds-abc",
      errorCode: "REAUTH_REQUIRED",
      errorMessage: "OAuth token expired",
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const raw = consoleSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(raw) as WidgetFetchErrorLogEntry;

    expect(entry.event).toBe("widget_data_fetch_error");
    expect(entry.widgetId).toBe("widget-001");
    expect(entry.dataSourceId).toBe("ds-abc");
    expect(entry.errorCode).toBe("REAUTH_REQUIRED");
    expect(entry.errorMessage).toBe("OAuth token expired");
  });

  it("正常系: timestamp が ISO 8601 形式で含まれる", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWidgetFetchError({
      widgetId: "w1",
      dataSourceId: "ds1",
      errorCode: "NETWORK_ERROR",
      errorMessage: "Connection refused",
    });

    const raw = consoleSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(raw) as WidgetFetchErrorLogEntry;

    // ISO 8601: "2026-07-07T12:34:56.789Z" のような形式
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("正常系: UNKNOWN エラーコードも正常に記録される（SheetFetchError 以外の例外）", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWidgetFetchError({
      widgetId: "w2",
      dataSourceId: "ds2",
      errorCode: "UNKNOWN",
      errorMessage: "An unknown error occurred",
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const raw = consoleSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(raw) as WidgetFetchErrorLogEntry;
    expect(entry.errorCode).toBe("UNKNOWN");
  });

  it("正常系: 複数のウィジェットエラーを連続して記録できる", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWidgetFetchError({
      widgetId: "w1",
      dataSourceId: "ds1",
      errorCode: "FORBIDDEN",
      errorMessage: "Access denied",
    });

    logWidgetFetchError({
      widgetId: "w2",
      dataSourceId: "ds2",
      errorCode: "NOT_FOUND",
      errorMessage: "Sheet not found",
    });

    expect(consoleSpy).toHaveBeenCalledTimes(2);

    const firstEntry = JSON.parse(
      consoleSpy.mock.calls[0]?.[0] as string,
    ) as WidgetFetchErrorLogEntry;
    const secondEntry = JSON.parse(
      consoleSpy.mock.calls[1]?.[0] as string,
    ) as WidgetFetchErrorLogEntry;

    expect(firstEntry.widgetId).toBe("w1");
    expect(secondEntry.widgetId).toBe("w2");
    expect(firstEntry.errorCode).toBe("FORBIDDEN");
    expect(secondEntry.errorCode).toBe("NOT_FOUND");
  });

  it("異常系: errorMessage が空文字でも記録できる（境界値）", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWidgetFetchError({
      widgetId: "w3",
      dataSourceId: "ds3",
      errorCode: "PARSE_ERROR",
      errorMessage: "",
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const raw = consoleSpy.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(raw) as WidgetFetchErrorLogEntry;
    expect(entry.errorMessage).toBe("");
  });
});

describe("captureServerException", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    // DSN が設定されているときの動作を検証するため、ダミー DSN を設定する。
    // captureServerException は SENTRY_DSN が空のとき import せずに early return する。
    process.env.SENTRY_DSN = "https://dummy@sentry.io/1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SENTRY_DSN;
  });

  // captureServerException は動的 import を使うため非同期で解決する。
  // vi.waitFor で captureException が呼ばれるまで待機する。

  it("正常系: REAUTH_REQUIRED のとき level が warning になる", async () => {
    const error = new Error("OAuth token expired");
    captureServerException(error, {
      errorCode: "REAUTH_REQUIRED",
      dataSourceId: "ds-1",
      widgetId: "w-1",
    });

    await vi.waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledOnce();
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "warning",
      tags: {
        errorCode: "REAUTH_REQUIRED",
        dataSourceId: "ds-1",
        widgetId: "w-1",
      },
    });
  });

  it("正常系: REAUTH_REQUIRED 以外のエラーコードのとき level が error になる", async () => {
    const error = new Error("Connection refused");
    captureServerException(error, {
      errorCode: "NETWORK_ERROR",
      dataSourceId: "ds-2",
      widgetId: "w-2",
    });

    await vi.waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledOnce();
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: {
        errorCode: "NETWORK_ERROR",
        dataSourceId: "ds-2",
        widgetId: "w-2",
      },
    });
  });

  it("正常系: errorCode のみのとき level が error になる", async () => {
    const error = new Error("Unknown error");
    captureServerException(error, { errorCode: "UNKNOWN" });

    await vi.waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledOnce();
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: { errorCode: "UNKNOWN" },
    });
  });

  it("正常系: タグに errorCode・dataSourceId・widgetId が含まれる", async () => {
    const error = new Error("test");
    captureServerException(error, {
      errorCode: "FORBIDDEN",
      dataSourceId: "ds-abc",
      widgetId: "w-xyz",
    });

    await vi.waitFor(() => {
      expect(
        vi.mocked(Sentry.captureException).mock.calls.length,
      ).toBeGreaterThan(0);
    });
    const call = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(call?.[1]).toMatchObject({
      tags: {
        errorCode: "FORBIDDEN",
        dataSourceId: "ds-abc",
        widgetId: "w-xyz",
      },
    });
  });

  it("異常系: タグに email や userId が含まれない", async () => {
    const error = new Error("test");
    captureServerException(error, {
      errorCode: "FORBIDDEN",
      dataSourceId: "ds-abc",
      widgetId: "w-xyz",
    });

    await vi.waitFor(() => {
      expect(
        vi.mocked(Sentry.captureException).mock.calls.length,
      ).toBeGreaterThan(0);
    });
    const call = vi.mocked(Sentry.captureException).mock.calls[0];
    const tags = (call?.[1] as { tags?: Record<string, unknown> })?.tags ?? {};
    expect(tags).not.toHaveProperty("email");
    expect(tags).not.toHaveProperty("userId");
  });

  it("境界値: context が空オブジェクトのとき level が error になる", async () => {
    const error = new Error("no context");
    captureServerException(error, {});

    await vi.waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledOnce();
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: {},
    });
  });

  it("境界値: SENTRY_DSN が未設定のとき captureException が呼ばれない", async () => {
    // beforeEach で設定した SENTRY_DSN を削除して DSN なし状態にする
    delete process.env.SENTRY_DSN;

    const error = new Error("no dsn");
    captureServerException(error, { errorCode: "NETWORK_ERROR" });

    // 100ms 待っても captureException が呼ばれないことを確認する
    await new Promise((r) => setTimeout(r, 100));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("境界値: SENTRY_DSN が空文字のとき captureException が呼ばれない", async () => {
    process.env.SENTRY_DSN = "";

    const error = new Error("empty dsn");
    captureServerException(error, { errorCode: "NETWORK_ERROR" });

    await new Promise((r) => setTimeout(r, 100));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("境界値: SENTRY_DSN が空白のみのとき captureException が呼ばれない", async () => {
    process.env.SENTRY_DSN = "   ";

    const error = new Error("whitespace dsn");
    captureServerException(error, { errorCode: "NETWORK_ERROR" });

    await new Promise((r) => setTimeout(r, 100));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

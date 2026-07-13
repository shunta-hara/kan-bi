import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logWidgetFetchError,
  type WidgetFetchErrorLogEntry,
} from "@/lib/observability/logger";

describe("logWidgetFetchError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

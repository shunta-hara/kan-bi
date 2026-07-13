import { describe, expect, it } from "vitest";

import {
  isSheetFetchError,
  SheetFetchError,
  toSheetFetchError,
} from "@/lib/sheets/errors";

describe("SheetFetchError", () => {
  it("code / message / name を保持する（正常系）", () => {
    const error = new SheetFetchError("NOT_FOUND", "見つかりませんでした");

    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("見つかりませんでした");
    expect(error.name).toBe("SheetFetchError");
    expect(error).toBeInstanceOf(Error);
  });

  it("cause を保持できる", () => {
    const cause = new Error("network down");
    const error = new SheetFetchError("NETWORK_ERROR", "失敗しました", {
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe("isSheetFetchError", () => {
  it("SheetFetchError のインスタンスを true と判定する（正常系）", () => {
    expect(isSheetFetchError(new SheetFetchError("UNKNOWN", "x"))).toBe(true);
  });

  it("通常の Error は false と判定する（異常系）", () => {
    expect(isSheetFetchError(new Error("plain error"))).toBe(false);
  });

  it("null/undefined/プリミティブは false と判定する（境界値）", () => {
    expect(isSheetFetchError(null)).toBe(false);
    expect(isSheetFetchError(undefined)).toBe(false);
    expect(isSheetFetchError("error string")).toBe(false);
    expect(isSheetFetchError(42)).toBe(false);
  });
});

describe("toSheetFetchError", () => {
  it("既に SheetFetchError の場合はそのまま返す（正常系）", () => {
    const original = new SheetFetchError("FORBIDDEN", "denied");
    expect(toSheetFetchError(original)).toBe(original);
  });

  it("通常の Error は UNKNOWN な SheetFetchError に変換する", () => {
    const original = new Error("boom");
    const converted = toSheetFetchError(original);

    expect(converted).toBeInstanceOf(SheetFetchError);
    expect(converted.code).toBe("UNKNOWN");
    expect(converted.message).toBe("boom");
    expect(converted.cause).toBe(original);
  });

  it("Error 以外の例外（文字列・オブジェクト等）も UNKNOWN に変換する（境界値）", () => {
    const converted = toSheetFetchError("just a string");

    expect(converted).toBeInstanceOf(SheetFetchError);
    expect(converted.code).toBe("UNKNOWN");
    expect(converted.message).toContain("unknown error");
  });
});

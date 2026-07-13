import { describe, expect, it } from "vitest";

import {
  buildGvizCsvUrl,
  classifyGvizHttpStatus,
  isCsvContentType,
} from "@/lib/sheets/gvizUrl";

describe("buildGvizCsvUrl", () => {
  it("シート名・セル範囲の両方を含む URL を構築する（正常系）", () => {
    const url = buildGvizCsvUrl("abc123", {
      sheetName: "Sheet1",
      cellRange: "A1:F100",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/gviz/tq",
    );
    expect(parsed.searchParams.get("tqx")).toBe("out:csv");
    expect(parsed.searchParams.get("sheet")).toBe("Sheet1");
    expect(parsed.searchParams.get("range")).toBe("A1:F100");
  });

  it("シート名のみの場合は range パラメータを付与しない", () => {
    const url = buildGvizCsvUrl("abc123", {
      sheetName: "Sheet1",
      cellRange: null,
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get("sheet")).toBe("Sheet1");
    expect(parsed.searchParams.has("range")).toBe(false);
  });

  it("セル範囲のみの場合は sheet パラメータを付与しない", () => {
    const url = buildGvizCsvUrl("abc123", {
      sheetName: null,
      cellRange: "A1:F100",
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.has("sheet")).toBe(false);
    expect(parsed.searchParams.get("range")).toBe("A1:F100");
  });

  it("spreadsheetId を URL エンコードする（境界値: 特殊文字）", () => {
    const url = buildGvizCsvUrl("abc 123/x", {
      sheetName: null,
      cellRange: null,
    });
    expect(url).toContain(encodeURIComponent("abc 123/x"));
  });
});

describe("classifyGvizHttpStatus", () => {
  it("200 系は null（成功扱い）を返す（正常系）", () => {
    expect(classifyGvizHttpStatus(200)).toBeNull();
    expect(classifyGvizHttpStatus(204)).toBeNull();
  });

  it("404 は NOT_FOUND に分類する", () => {
    expect(classifyGvizHttpStatus(404)?.code).toBe("NOT_FOUND");
  });

  it("400 は INVALID_RANGE に分類する", () => {
    expect(classifyGvizHttpStatus(400)?.code).toBe("INVALID_RANGE");
  });

  it.each([401, 403])("%i は FORBIDDEN に分類する", (status) => {
    expect(classifyGvizHttpStatus(status)?.code).toBe("FORBIDDEN");
  });

  it("その他のエラーステータスは UNKNOWN に分類する（境界値）", () => {
    expect(classifyGvizHttpStatus(500)?.code).toBe("UNKNOWN");
    expect(classifyGvizHttpStatus(599)?.code).toBe("UNKNOWN");
  });

  it("300番台（リダイレクト）はエラーとして分類する（fetch がリダイレクトを解決しない異常系を防御）", () => {
    expect(classifyGvizHttpStatus(301)?.code).toBe("UNKNOWN");
  });
});

describe("isCsvContentType", () => {
  it("text/csv を CSV として判定する（正常系）", () => {
    expect(isCsvContentType("text/csv; charset=UTF-8")).toBe(true);
  });

  it("text/plain も CSV として判定する（gviz の実挙動への対応）", () => {
    expect(isCsvContentType("text/plain; charset=UTF-8")).toBe(true);
  });

  it("text/html は CSV として判定しない（非公開シートのログインページ検知）", () => {
    expect(isCsvContentType("text/html; charset=UTF-8")).toBe(false);
  });

  it("空文字列は CSV として判定しない（境界値）", () => {
    expect(isCsvContentType("")).toBe(false);
  });
});

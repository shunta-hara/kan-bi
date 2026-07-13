import { describe, expect, it } from "vitest";

import {
  canDeleteDataSource,
  columnTypeOverridesSchema,
  createDataSourceInputSchema,
  dataSourceDetailSchema,
  dataSourceInUseErrorSchema,
  dataSourceSummarySchema,
  dataSourceUsageSchema,
  extractSpreadsheetId,
  parseColumnTypeOverrides,
  parseRange,
  previewDataSourceInputSchema,
  rangeSchema,
  rateLimitErrorSchema,
  refreshDataSourceApiResponseSchema,
  spreadsheetIdSchema,
  spreadsheetUrlOrIdSchema,
  syncStatusSchema,
  updateDataSourceInputSchema,
} from "@/lib/sheets/schema";

describe("extractSpreadsheetId", () => {
  describe("正常系", () => {
    it.each([
      [
        "https://docs.google.com/spreadsheets/d/1A2B3C4D5E/edit#gid=0",
        "1A2B3C4D5E",
      ],
      ["https://docs.google.com/spreadsheets/d/1A2B3C4D5E/edit", "1A2B3C4D5E"],
      ["https://docs.google.com/spreadsheets/d/1A2B3C4D5E/", "1A2B3C4D5E"],
      ["https://docs.google.com/spreadsheets/d/1A2B3C4D5E", "1A2B3C4D5E"],
      [
        "https://docs.google.com/spreadsheets/d/1A2B3C4D5E?usp=sharing",
        "1A2B3C4D5E",
      ],
      ["1A2B3C4D5E", "1A2B3C4D5E"],
      ["  1A2B3C4D5E  ", "1A2B3C4D5E"],
    ])("%s から %s を抽出する", (input, expected) => {
      expect(extractSpreadsheetId(input)).toBe(expected);
    });
  });

  describe("異常系", () => {
    it.each([
      "",
      "   ",
      "https://example.com/not-a-spreadsheet",
      "https://docs.google.com/spreadsheets/",
      "not a valid id with spaces",
      "contains/slash",
    ])("%s からは抽出できず null を返す", (input) => {
      expect(extractSpreadsheetId(input)).toBeNull();
    });
  });
});

describe("spreadsheetIdSchema", () => {
  it("英数字・ハイフン・アンダースコアのみを許可する", () => {
    expect(spreadsheetIdSchema.safeParse("abc-DEF_123").success).toBe(true);
  });

  it("空文字列を reject する（境界値）", () => {
    expect(spreadsheetIdSchema.safeParse("").success).toBe(false);
  });

  it("不正な文字（スラッシュ等）を含む場合は reject する", () => {
    expect(spreadsheetIdSchema.safeParse("abc/def").success).toBe(false);
  });
});

describe("spreadsheetUrlOrIdSchema", () => {
  it("URL から spreadsheetId を抽出して返す（正常系）", () => {
    const result = spreadsheetUrlOrIdSchema.safeParse(
      "https://docs.google.com/spreadsheets/d/1A2B3C4D5E/edit",
    );
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("1A2B3C4D5E");
  });

  it("ID をそのまま渡しても受け付ける（正常系）", () => {
    const result = spreadsheetUrlOrIdSchema.safeParse("1A2B3C4D5E");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("1A2B3C4D5E");
  });

  it("抽出できない入力は reject する（異常系）", () => {
    expect(
      spreadsheetUrlOrIdSchema.safeParse("https://example.com/foo").success,
    ).toBe(false);
  });

  it("空文字列を reject する（境界値）", () => {
    expect(spreadsheetUrlOrIdSchema.safeParse("").success).toBe(false);
  });
});

describe("parseRange", () => {
  describe("正常系", () => {
    it("シート名 + セル範囲（A1記法）を分解する", () => {
      expect(parseRange("Sheet1!A1:F100")).toEqual({
        sheetName: "Sheet1",
        cellRange: "A1:F100",
      });
    });

    it("シート名のみを許可する", () => {
      expect(parseRange("Sheet1")).toEqual({
        sheetName: "Sheet1",
        cellRange: null,
      });
    });

    it("セル範囲のみ（シート名なし）を許可する", () => {
      expect(parseRange("A1:F100")).toEqual({
        sheetName: null,
        cellRange: "A1:F100",
      });
    });

    it("単一セルの範囲を許可する", () => {
      expect(parseRange("Sheet1!A1")).toEqual({
        sheetName: "Sheet1",
        cellRange: "A1",
      });
    });

    it("シート名 + '!' のみ（セル範囲省略）を許可する", () => {
      expect(parseRange("Sheet1!")).toEqual({
        sheetName: "Sheet1",
        cellRange: null,
      });
    });

    it("前後の空白をトリムする", () => {
      expect(parseRange("  Sheet1!A1:F100  ")).toEqual({
        sheetName: "Sheet1",
        cellRange: "A1:F100",
      });
    });
  });

  describe("異常系・境界値", () => {
    it("空文字列は null を返す", () => {
      expect(parseRange("")).toBeNull();
      expect(parseRange("   ")).toBeNull();
    });

    it("不正なセル範囲表記は null を返す", () => {
      expect(parseRange("Sheet1!ZZZ")).toBeNull();
      expect(parseRange("Sheet1!1:100")).toBeNull();
      expect(parseRange("Sheet1!A0:F100")).toBeNull();
    });

    it("シート名に禁止文字を含む場合は null を返す", () => {
      expect(parseRange("Sheet[1]!A1:F100")).toBeNull();
      expect(parseRange("Sheet/1!A1:F100")).toBeNull();
    });
  });
});

describe("rangeSchema", () => {
  it("正しい形式の range を許可する", () => {
    expect(rangeSchema.safeParse("Sheet1!A1:F100").success).toBe(true);
    expect(rangeSchema.safeParse("Sheet1").success).toBe(true);
  });

  it("空文字列を reject する（境界値）", () => {
    expect(rangeSchema.safeParse("").success).toBe(false);
  });

  it("不正な形式を reject する（異常系）", () => {
    expect(rangeSchema.safeParse("not a valid range!!!").success).toBe(false);
  });

  it("200文字を超える場合は reject する（境界値）", () => {
    expect(rangeSchema.safeParse("A".repeat(201)).success).toBe(false);
  });
});

describe("columnTypeOverridesSchema / parseColumnTypeOverrides", () => {
  it("列名→型のレコードを許可する（正常系）", () => {
    const input = { 売上: "number", 日付: "date", 担当: "string" };
    expect(columnTypeOverridesSchema.safeParse(input).success).toBe(true);
  });

  it("空オブジェクトを許可する（境界値）", () => {
    expect(columnTypeOverridesSchema.safeParse({}).success).toBe(true);
  });

  it("不正な型名を含む場合は reject する（異常系）", () => {
    expect(
      columnTypeOverridesSchema.safeParse({ 売上: "currency" }).success,
    ).toBe(false);
  });

  it("parseColumnTypeOverrides は null/undefined を空オブジェクトにフォールバックする", () => {
    expect(parseColumnTypeOverrides(null)).toEqual({});
    expect(parseColumnTypeOverrides(undefined)).toEqual({});
  });

  it("parseColumnTypeOverrides は不正な値を空オブジェクトにフォールバックする（堅牢性）", () => {
    expect(parseColumnTypeOverrides("not-a-record")).toEqual({});
    expect(parseColumnTypeOverrides({ col: "invalid-type" })).toEqual({});
  });

  it("parseColumnTypeOverrides は妥当な値をそのまま返す", () => {
    expect(parseColumnTypeOverrides({ 売上: "number" })).toEqual({
      売上: "number",
    });
  });
});

describe("createDataSourceInputSchema", () => {
  const validInput = {
    name: "月次売上",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1A2B3C4D5E/edit",
    range: "Sheet1!A1:F100",
    authMode: "PUBLIC" as const,
    refreshIntervalSec: 300,
  };

  describe("正常系", () => {
    it("妥当な入力を許可し、spreadsheetId を抽出した形で返す", () => {
      const result = createDataSourceInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spreadsheetUrl).toBe("1A2B3C4D5E");
        expect(result.data.authMode).toBe("PUBLIC");
      }
    });

    it("authMode / refreshIntervalSec を省略した場合に既定値を補う", () => {
      const {
        authMode: _authMode,
        refreshIntervalSec: _interval,
        ...rest
      } = validInput;
      const result = createDataSourceInputSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authMode).toBe("PUBLIC");
        expect(result.data.refreshIntervalSec).toBe(300);
      }
    });
  });

  describe("異常系", () => {
    it("name が空文字列の場合は reject する", () => {
      expect(
        createDataSourceInputSchema.safeParse({ ...validInput, name: "" })
          .success,
      ).toBe(false);
    });

    it("spreadsheetUrl が解決不能な場合は reject する", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          spreadsheetUrl: "https://example.com/not-a-sheet",
        }).success,
      ).toBe(false);
    });

    it("range が不正な形式の場合は reject する", () => {
      expect(
        createDataSourceInputSchema.safeParse({ ...validInput, range: "???" })
          .success,
      ).toBe(false);
    });

    it("authMode が未知の値の場合は reject する", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          authMode: "ANONYMOUS",
        }).success,
      ).toBe(false);
    });
  });

  describe("境界値", () => {
    it("name が120文字ちょうどなら許可する", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          name: "あ".repeat(120),
        }).success,
      ).toBe(true);
    });

    it("name が121文字なら reject する", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          name: "あ".repeat(121),
        }).success,
      ).toBe(false);
    });

    it("refreshIntervalSec が60未満なら reject する（最小値未満）", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          refreshIntervalSec: 59,
        }).success,
      ).toBe(false);
    });

    it("refreshIntervalSec が60ちょうどなら許可する（最小値）", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          refreshIntervalSec: 60,
        }).success,
      ).toBe(true);
    });

    it("refreshIntervalSec が86400を超える場合は reject する（最大値超過）", () => {
      expect(
        createDataSourceInputSchema.safeParse({
          ...validInput,
          refreshIntervalSec: 86_401,
        }).success,
      ).toBe(false);
    });
  });
});

describe("previewDataSourceInputSchema", () => {
  it("name を要求せず、取得に必要な項目だけで成立する（正常系）", () => {
    const result = previewDataSourceInputSchema.safeParse({
      spreadsheetUrl: "1A2B3C4D5E",
      range: "Sheet1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authMode).toBe("PUBLIC");
    }
  });

  it("range を欠く場合は reject する（異常系）", () => {
    expect(
      previewDataSourceInputSchema.safeParse({ spreadsheetUrl: "1A2B3C4D5E" })
        .success,
    ).toBe(false);
  });
});

describe("updateDataSourceInputSchema", () => {
  describe("正常系", () => {
    it("name のみの部分更新を許可する", () => {
      const result = updateDataSourceInputSchema.safeParse({
        name: "新しい名前",
      });
      expect(result.success).toBe(true);
    });

    it("range・refreshIntervalSec・columnTypes を組み合わせた更新を許可する", () => {
      const result = updateDataSourceInputSchema.safeParse({
        range: "Sheet1!A1:C50",
        refreshIntervalSec: 600,
        columnTypes: { 売上: "number", 日付: "date" },
      });
      expect(result.success).toBe(true);
    });

    it("columnTypes に null を渡すとオーバーライド全解除の指定として許可する", () => {
      const result = updateDataSourceInputSchema.safeParse({
        columnTypes: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.columnTypes).toBeNull();
      }
    });
  });

  describe("異常系", () => {
    it("何も指定しない更新は reject する（空更新の防止）", () => {
      expect(updateDataSourceInputSchema.safeParse({}).success).toBe(false);
    });

    it("name が空文字列の場合は reject する", () => {
      expect(updateDataSourceInputSchema.safeParse({ name: "" }).success).toBe(
        false,
      );
    });

    it("range が不正な形式の場合は reject する", () => {
      expect(
        updateDataSourceInputSchema.safeParse({ range: "???" }).success,
      ).toBe(false);
    });

    it("columnTypes に未知の型名が含まれる場合は reject する", () => {
      expect(
        updateDataSourceInputSchema.safeParse({
          columnTypes: { 列1: "currency" },
        }).success,
      ).toBe(false);
    });
  });

  describe("境界値", () => {
    it("refreshIntervalSec が60ちょうどなら許可する（最小値）", () => {
      expect(
        updateDataSourceInputSchema.safeParse({ refreshIntervalSec: 60 })
          .success,
      ).toBe(true);
    });

    it("refreshIntervalSec が59なら reject する（最小値未満）", () => {
      expect(
        updateDataSourceInputSchema.safeParse({ refreshIntervalSec: 59 })
          .success,
      ).toBe(false);
    });

    it("refreshIntervalSec が86400ちょうどなら許可する（最大値）", () => {
      expect(
        updateDataSourceInputSchema.safeParse({ refreshIntervalSec: 86_400 })
          .success,
      ).toBe(true);
    });

    it("refreshIntervalSec が86401なら reject する（最大値超過）", () => {
      expect(
        updateDataSourceInputSchema.safeParse({ refreshIntervalSec: 86_401 })
          .success,
      ).toBe(false);
    });

    it("columnTypes が空オブジェクトの場合は許可する（オーバーライドなしの明示指定）", () => {
      expect(
        updateDataSourceInputSchema.safeParse({ columnTypes: {} }).success,
      ).toBe(true);
    });
  });
});

describe("dataSourceUsageSchema / canDeleteDataSource", () => {
  describe("正常系", () => {
    it("widgetCount が 0 のときは削除可能と判定する", () => {
      expect(canDeleteDataSource({ widgetCount: 0, dashboardCount: 0 })).toBe(
        true,
      );
    });

    it("widgetCount が 1 以上のときは削除不可と判定する（FEAT-003: 使用中は直接削除できない）", () => {
      expect(canDeleteDataSource({ widgetCount: 1, dashboardCount: 1 })).toBe(
        false,
      );
    });

    it("複数のダッシュボードから参照されている場合も削除不可と判定する（再利用の確認）", () => {
      expect(canDeleteDataSource({ widgetCount: 3, dashboardCount: 2 })).toBe(
        false,
      );
    });
  });

  describe("異常系・境界値", () => {
    it("負の widgetCount は schema レベルで reject する", () => {
      expect(
        dataSourceUsageSchema.safeParse({ widgetCount: -1, dashboardCount: 0 })
          .success,
      ).toBe(false);
    });

    it("小数の widgetCount は schema レベルで reject する", () => {
      expect(
        dataSourceUsageSchema.safeParse({ widgetCount: 1.5, dashboardCount: 1 })
          .success,
      ).toBe(false);
    });
  });
});

describe("syncStatusSchema", () => {
  describe("正常系", () => {
    it.each(["IDLE", "SYNCING", "OK", "ERROR", "REAUTH_REQUIRED"] as const)(
      "%s を許可する",
      (status) => {
        expect(syncStatusSchema.safeParse(status).success).toBe(true);
      },
    );
  });

  describe("異常系", () => {
    it("未知の値は reject する", () => {
      expect(syncStatusSchema.safeParse("PENDING").success).toBe(false);
    });

    it("空文字列は reject する（境界値）", () => {
      expect(syncStatusSchema.safeParse("").success).toBe(false);
    });
  });
});

describe("dataSourceSummarySchema / dataSourceDetailSchema", () => {
  const baseSummary = {
    id: "ds_1",
    name: "売上データ",
    spreadsheetId: "1A2B3C4D5E",
    range: "Sheet1!A1:C100",
    authMode: "PUBLIC" as const,
    refreshIntervalSec: 300,
    columnTypes: { 売上: "number" as const },
    usage: { widgetCount: 0, dashboardCount: 0 },
    syncStatus: "IDLE" as const,
    lastSyncedAt: null,
    lastSyncError: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  };

  it("利用状況・列型オーバーライド・同期ステータスを含む一覧用の形を検証できる（正常系）", () => {
    expect(dataSourceSummarySchema.safeParse(baseSummary).success).toBe(true);
  });

  it("syncStatus が OK で lastSyncedAt に日時を持つ場合を許可する（正常系）", () => {
    const result = dataSourceSummarySchema.safeParse({
      ...baseSummary,
      syncStatus: "OK",
      lastSyncedAt: new Date("2026-06-01T12:00:00Z"),
    });
    expect(result.success).toBe(true);
  });

  it("syncStatus が REAUTH_REQUIRED の場合を許可する（正常系）", () => {
    expect(
      dataSourceSummarySchema.safeParse({
        ...baseSummary,
        syncStatus: "REAUTH_REQUIRED",
      }).success,
    ).toBe(true);
  });

  it("文字列の日時も coerce して Date に変換する（API レスポンスの JSON 経由を想定）", () => {
    const result = dataSourceSummarySchema.safeParse({
      ...baseSummary,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it("usage を欠く場合は reject する（異常系: 利用状況は必須）", () => {
    const { usage: _usage, ...withoutUsage } = baseSummary;
    expect(dataSourceSummarySchema.safeParse(withoutUsage).success).toBe(false);
  });

  it("syncStatus を欠く場合は reject する（異常系）", () => {
    const { syncStatus: _s, ...withoutSync } = baseSummary;
    expect(dataSourceSummarySchema.safeParse(withoutSync).success).toBe(false);
  });

  it("詳細スキーマはプレビュー（columns/rows）を含めて検証する（正常系）", () => {
    const detail = {
      ...baseSummary,
      preview: {
        columns: [{ name: "売上", inferredType: "number" as const }],
        rows: [["1000"]],
        totalRowCount: 1,
        truncated: false,
      },
    };
    expect(dataSourceDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("詳細スキーマで preview を欠く場合は reject する（異常系）", () => {
    expect(dataSourceDetailSchema.safeParse(baseSummary).success).toBe(false);
  });
});

describe("dataSourceInUseErrorSchema", () => {
  it("DATA_SOURCE_IN_USE エラーレスポンスの形を検証できる（正常系）", () => {
    const result = dataSourceInUseErrorSchema.safeParse({
      error: {
        code: "DATA_SOURCE_IN_USE",
        message: "in use",
        usage: { widgetCount: 2, dashboardCount: 1 },
      },
    });
    expect(result.success).toBe(true);
  });

  it("code が DATA_SOURCE_IN_USE 以外の場合は reject する（異常系）", () => {
    const result = dataSourceInUseErrorSchema.safeParse({
      error: {
        code: "NOT_FOUND",
        message: "not found",
        usage: { widgetCount: 0, dashboardCount: 0 },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("rateLimitErrorSchema", () => {
  it("RATE_LIMITED エラーレスポンスを許可する（正常系）", () => {
    const result = rateLimitErrorSchema.safeParse({
      error: { code: "RATE_LIMITED", message: "too many", retryAfterSec: 30 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error.retryAfterSec).toBe(30);
    }
  });

  it("retryAfterSec が負数の場合は reject する（異常系）", () => {
    expect(
      rateLimitErrorSchema.safeParse({
        error: { code: "RATE_LIMITED", message: "too many", retryAfterSec: -1 },
      }).success,
    ).toBe(false);
  });

  it("retryAfterSec が 0 の場合は許可する（境界値）", () => {
    expect(
      rateLimitErrorSchema.safeParse({
        error: { code: "RATE_LIMITED", message: "too many", retryAfterSec: 0 },
      }).success,
    ).toBe(true);
  });

  it("code が RATE_LIMITED 以外の場合は reject する（異常系）", () => {
    expect(
      rateLimitErrorSchema.safeParse({
        error: {
          code: "UNKNOWN",
          message: "unknown",
          retryAfterSec: 10,
        },
      }).success,
    ).toBe(false);
  });
});

describe("refreshDataSourceApiResponseSchema", () => {
  const baseData = {
    id: "ds_1",
    name: "テスト",
    spreadsheetId: "1A2B3C4D5E",
    range: "Sheet1",
    authMode: "PUBLIC" as const,
    refreshIntervalSec: 300,
    columnTypes: {},
    usage: { widgetCount: 0, dashboardCount: 0 },
    syncStatus: "OK" as const,
    lastSyncedAt: new Date("2026-06-09T00:00:00Z"),
    lastSyncError: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-06-09T00:00:00Z"),
  };

  it("syncStatus=OK のリフレッシュレスポンスを許可する（正常系）", () => {
    expect(
      refreshDataSourceApiResponseSchema.safeParse({ data: baseData }).success,
    ).toBe(true);
  });

  it("syncStatus=REAUTH_REQUIRED のレスポンスも許可する（FEAT-006 再認可状態）", () => {
    expect(
      refreshDataSourceApiResponseSchema.safeParse({
        data: {
          ...baseData,
          syncStatus: "REAUTH_REQUIRED",
          lastSyncedAt: null,
        },
      }).success,
    ).toBe(true);
  });

  it("data を欠く場合は reject する（異常系）", () => {
    expect(refreshDataSourceApiResponseSchema.safeParse({}).success).toBe(
      false,
    );
  });
});

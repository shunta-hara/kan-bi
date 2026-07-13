import { describe, it, expect } from "vitest";
import {
  autoRecommend,
  resultToFormState,
  hasExistingFormSettings,
} from "@/lib/query/autoRecommend";
import type { InferredColumn } from "@/lib/sheets/schema";

// ─────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────

function col(name: string, type: "number" | "date" | "string"): InferredColumn {
  return { name, inferredType: type };
}

// ─────────────────────────────────────────────
// ルール 1: 列が 0 件
// ─────────────────────────────────────────────

describe("autoRecommend - 列が 0 件", () => {
  it("正常系: 空配列を渡すと table が返る", () => {
    const result = autoRecommend([]);
    expect(result.chartType).toBe("table");
    expect(result.groupByColumn).toBeUndefined();
    expect(result.measures).toHaveLength(0);
    expect(result.xAxisColumn).toBeUndefined();
    expect(result.yAxisColumn).toBeUndefined();
    expect(result.rationale).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
// ルール 2: number も date も 0 件（文字列のみ）
// ─────────────────────────────────────────────

describe("autoRecommend - 文字列列のみ", () => {
  it("正常系: string 1 件のとき table が返る", () => {
    const result = autoRecommend([col("category", "string")]);
    expect(result.chartType).toBe("table");
    expect(result.groupByColumn).toBeUndefined();
    expect(result.measures).toHaveLength(0);
  });

  it("正常系: string 複数件のとき table が返る", () => {
    const result = autoRecommend([
      col("name", "string"),
      col("category", "string"),
      col("status", "string"),
    ]);
    expect(result.chartType).toBe("table");
  });
});

// ─────────────────────────────────────────────
// ルール 3: number 1 件・string 0 件・date 0 件 → kpi
// ─────────────────────────────────────────────

describe("autoRecommend - kpi", () => {
  it("正常系: number 1 件のみのとき kpi が返り measure に列が含まれる", () => {
    const result = autoRecommend([col("revenue", "number")]);
    expect(result.chartType).toBe("kpi");
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0]?.column).toBe("revenue");
    expect(result.measures[0]?.function).toBe("sum");
    expect(result.groupByColumn).toBeUndefined();
    expect(result.xAxisColumn).toBeUndefined();
  });

  it("正常系: kpi のとき rationale が空でない", () => {
    const result = autoRecommend([col("sales", "number")]);
    expect(result.rationale.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// ルール 4: number ≥2 件・string 0 件・date 0 件 → scatter
// ─────────────────────────────────────────────

describe("autoRecommend - scatter", () => {
  it("正常系: number 2 件のとき scatter が返り xAxisColumn に 1 件目、yAxisColumn に 2 件目が入る", () => {
    const result = autoRecommend([col("x", "number"), col("y", "number")]);
    expect(result.chartType).toBe("scatter");
    expect(result.xAxisColumn).toBe("x");
    expect(result.yAxisColumn).toBe("y");
    expect(result.groupByColumn).toBeUndefined();
    expect(result.measures).toHaveLength(0);
  });

  it("正常系: number 3 件のとき先頭 2 件が xAxis・yAxis になる（先頭優先）", () => {
    const result = autoRecommend([
      col("a", "number"),
      col("b", "number"),
      col("c", "number"),
    ]);
    expect(result.chartType).toBe("scatter");
    expect(result.xAxisColumn).toBe("a");
    expect(result.yAxisColumn).toBe("b");
  });
});

// ─────────────────────────────────────────────
// ルール 5: date ≥1 件・number ≥1 件 → line
// ─────────────────────────────────────────────

describe("autoRecommend - line", () => {
  it("正常系: date 1 件 + number 1 件のとき line が返る", () => {
    const result = autoRecommend([col("date", "date"), col("value", "number")]);
    expect(result.chartType).toBe("line");
    expect(result.groupByColumn).toBe("date");
    expect(result.xAxisColumn).toBe("date");
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0]?.column).toBe("value");
    expect(result.measures[0]?.function).toBe("sum");
  });

  it("正常系: date + number + string が混在しても line が返る（string の有無は問わない）", () => {
    const result = autoRecommend([
      col("category", "string"),
      col("created_at", "date"),
      col("amount", "number"),
    ]);
    expect(result.chartType).toBe("line");
    expect(result.groupByColumn).toBe("created_at");
    expect(result.xAxisColumn).toBe("created_at");
  });

  it("正常系: date が複数あるとき先頭の date 列が使われる", () => {
    const result = autoRecommend([
      col("start_date", "date"),
      col("end_date", "date"),
      col("score", "number"),
    ]);
    expect(result.chartType).toBe("line");
    expect(result.groupByColumn).toBe("start_date");
  });
});

// ─────────────────────────────────────────────
// ルール 6: string ≥1 件・number ≥1 件・date 0 件 → bar
// ─────────────────────────────────────────────

describe("autoRecommend - bar", () => {
  it("正常系: string 1 件 + number 1 件 (date なし) のとき bar が返る", () => {
    const result = autoRecommend([
      col("category", "string"),
      col("sales", "number"),
    ]);
    expect(result.chartType).toBe("bar");
    expect(result.groupByColumn).toBe("category");
    expect(result.xAxisColumn).toBe("category");
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0]?.column).toBe("sales");
    expect(result.measures[0]?.function).toBe("sum");
  });

  it("正常系: string 複数 + number 複数のとき先頭の string / number が使われる", () => {
    const result = autoRecommend([
      col("region", "string"),
      col("product", "string"),
      col("revenue", "number"),
      col("cost", "number"),
    ]);
    expect(result.chartType).toBe("bar");
    expect(result.groupByColumn).toBe("region");
    expect(result.measures[0]?.column).toBe("revenue");
  });
});

// ─────────────────────────────────────────────
// ルール 7: 上記すべてに該当しない → table
// ─────────────────────────────────────────────

describe("autoRecommend - フォールバック (table)", () => {
  it("異常系: date のみ（number なし）のとき table が返る", () => {
    // date ≥1 件だが number が 0 件 → ルール 5 に該当しない
    const result = autoRecommend([col("created_at", "date")]);
    expect(result.chartType).toBe("table");
    expect(result.rationale.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// 大量列（10 列超）と先頭優先ルール
// ─────────────────────────────────────────────

describe("autoRecommend - 列数が多い場合の先頭優先", () => {
  it("境界値: string 6 件 + number 6 件（計 12 列）でも bar が返り先頭列が使われる", () => {
    const columns: InferredColumn[] = [
      col("s1", "string"),
      col("s2", "string"),
      col("s3", "string"),
      col("s4", "string"),
      col("s5", "string"),
      col("s6", "string"),
      col("n1", "number"),
      col("n2", "number"),
      col("n3", "number"),
      col("n4", "number"),
      col("n5", "number"),
      col("n6", "number"),
    ];
    const result = autoRecommend(columns);
    expect(result.chartType).toBe("bar");
    expect(result.groupByColumn).toBe("s1");
    expect(result.measures[0]?.column).toBe("n1");
  });

  it("境界値: date 6 件 + number 6 件（計 12 列）でも line が返り先頭列が使われる", () => {
    const columns: InferredColumn[] = [
      col("d1", "date"),
      col("d2", "date"),
      col("d3", "date"),
      col("d4", "date"),
      col("d5", "date"),
      col("d6", "date"),
      col("n1", "number"),
      col("n2", "number"),
      col("n3", "number"),
      col("n4", "number"),
      col("n5", "number"),
      col("n6", "number"),
    ];
    const result = autoRecommend(columns);
    expect(result.chartType).toBe("line");
    expect(result.groupByColumn).toBe("d1");
    expect(result.measures[0]?.column).toBe("n1");
  });
});

// ─────────────────────────────────────────────
// 冪等性（同一入力で同じ結果）
// ─────────────────────────────────────────────

describe("autoRecommend - 冪等性", () => {
  it("同一入力を 2 回呼び出しても同じ結果が返る（line ケース）", () => {
    const input: InferredColumn[] = [
      col("date", "date"),
      col("sales", "number"),
    ];
    const first = autoRecommend(input);
    const second = autoRecommend(input);
    expect(first).toEqual(second);
  });

  it("同一入力を 2 回呼び出しても同じ結果が返る（bar ケース）", () => {
    const input: InferredColumn[] = [
      col("region", "string"),
      col("revenue", "number"),
    ];
    const first = autoRecommend(input);
    const second = autoRecommend(input);
    expect(first).toEqual(second);
  });
});

// ─────────────────────────────────────────────
// rationale: チャート種別ごとに異なる内容
// ─────────────────────────────────────────────

describe("autoRecommend - rationale の一意性", () => {
  it("各ルールで rationale が異なる文字列になっている", () => {
    const rationales = new Set([
      autoRecommend([]).rationale,
      autoRecommend([col("cat", "string")]).rationale,
      autoRecommend([col("val", "number")]).rationale,
      autoRecommend([col("x", "number"), col("y", "number")]).rationale,
      autoRecommend([col("dt", "date"), col("v", "number")]).rationale,
      autoRecommend([col("s", "string"), col("n", "number")]).rationale,
    ]);
    // 6 つのルールそれぞれで rationale が異なる
    expect(rationales.size).toBe(6);
  });
});

// ─────────────────────────────────────────────
// resultToFormState: AutoRecommendResult → フォーム状態変換
// ─────────────────────────────────────────────

describe("resultToFormState - 正常系", () => {
  it("line 推薦結果を正しくフォーム状態に変換する", () => {
    const result = autoRecommend([
      col("created_at", "date"),
      col("sales", "number"),
    ]);
    const state = resultToFormState(result);
    expect(state.chartType).toBe("line");
    expect(state.groupByColumn).toBe("created_at");
    expect(state.measureColumn).toBe("sales");
    expect(state.measureFunction).toBe("sum");
    expect(state.xAxisColumn).toBe("created_at");
    expect(state.yAxisColumn).toBe("sales");
  });

  it("bar 推薦結果を正しくフォーム状態に変換する", () => {
    const result = autoRecommend([
      col("region", "string"),
      col("revenue", "number"),
    ]);
    const state = resultToFormState(result);
    expect(state.chartType).toBe("bar");
    expect(state.groupByColumn).toBe("region");
    expect(state.measureColumn).toBe("revenue");
    expect(state.measureFunction).toBe("sum");
    expect(state.xAxisColumn).toBe("region");
    expect(state.yAxisColumn).toBe("revenue");
  });

  it("kpi 推薦結果を正しくフォーム状態に変換する", () => {
    const result = autoRecommend([col("total", "number")]);
    const state = resultToFormState(result);
    expect(state.chartType).toBe("kpi");
    expect(state.groupByColumn).toBe("");
    expect(state.measureColumn).toBe("total");
    expect(state.measureFunction).toBe("sum");
    expect(state.xAxisColumn).toBe("");
    expect(state.yAxisColumn).toBe("total");
  });

  it("scatter 推薦結果: 集計なしのため measureColumn が空・measureFunction がデフォルト count", () => {
    const result = autoRecommend([col("x", "number"), col("y", "number")]);
    const state = resultToFormState(result);
    expect(state.chartType).toBe("scatter");
    expect(state.measureColumn).toBe("");
    expect(state.measureFunction).toBe("count");
    expect(state.xAxisColumn).toBe("x");
    expect(state.yAxisColumn).toBe("y");
    expect(state.groupByColumn).toBe("");
  });
});

describe("resultToFormState - 境界値", () => {
  it("table 推薦結果（空列）: すべての列フィールドが空文字列で measureFunction が count", () => {
    const result = autoRecommend([]);
    const state = resultToFormState(result);
    expect(state.chartType).toBe("table");
    expect(state.groupByColumn).toBe("");
    expect(state.measureColumn).toBe("");
    expect(state.measureFunction).toBe("count");
    expect(state.xAxisColumn).toBe("");
    expect(state.yAxisColumn).toBe("");
  });

  it("table 推薦結果（文字列列のみ）: すべての列フィールドが空文字列", () => {
    const result = autoRecommend([col("name", "string")]);
    const state = resultToFormState(result);
    expect(state.chartType).toBe("table");
    expect(state.groupByColumn).toBe("");
    expect(state.measureColumn).toBe("");
  });
});

// ─────────────────────────────────────────────
// hasExistingFormSettings: フォームに列設定が存在するか判定
// ─────────────────────────────────────────────

describe("hasExistingFormSettings - 正常系", () => {
  const emptyState = {
    chartType: "table" as const,
    groupByColumn: "",
    measureColumn: "",
    measureFunction: "count" as const,
    xAxisColumn: "",
    yAxisColumn: "",
  };

  it("すべての列フィールドが空のとき false を返す", () => {
    expect(hasExistingFormSettings(emptyState)).toBe(false);
  });

  it("groupByColumn が設定されているとき true を返す", () => {
    expect(
      hasExistingFormSettings({ ...emptyState, groupByColumn: "category" }),
    ).toBe(true);
  });

  it("measureColumn が設定されているとき true を返す", () => {
    expect(
      hasExistingFormSettings({ ...emptyState, measureColumn: "sales" }),
    ).toBe(true);
  });

  it("xAxisColumn が設定されているとき true を返す", () => {
    expect(
      hasExistingFormSettings({ ...emptyState, xAxisColumn: "date" }),
    ).toBe(true);
  });

  it("yAxisColumn が設定されているとき true を返す", () => {
    expect(
      hasExistingFormSettings({ ...emptyState, yAxisColumn: "value" }),
    ).toBe(true);
  });

  it("複数フィールドが設定されているとき true を返す", () => {
    expect(
      hasExistingFormSettings({
        ...emptyState,
        groupByColumn: "category",
        measureColumn: "sales",
        xAxisColumn: "category",
        yAxisColumn: "sales",
      }),
    ).toBe(true);
  });
});

describe("hasExistingFormSettings - 境界値", () => {
  const emptyState = {
    chartType: "bar" as const,
    groupByColumn: "",
    measureColumn: "",
    measureFunction: "sum" as const,
    xAxisColumn: "",
    yAxisColumn: "",
  };

  it("スペースのみの groupByColumn は空とみなし false を返す（trim 検証）", () => {
    expect(
      hasExistingFormSettings({ ...emptyState, groupByColumn: "   " }),
    ).toBe(false);
  });

  it("スペースのみの measureColumn は空とみなし false を返す", () => {
    expect(
      hasExistingFormSettings({ ...emptyState, measureColumn: "\t" }),
    ).toBe(false);
  });
});

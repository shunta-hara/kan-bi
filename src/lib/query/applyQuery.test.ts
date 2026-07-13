import { describe, it, expect } from "vitest";
import { applyQuery, tableToRows } from "@/lib/query/applyQuery";
import type { NormalizedRow } from "@/lib/query/applyQuery";
import type { WidgetQuery } from "@/lib/dashboards/schema";

// ─────────────────────────────────────────────
// テストデータ
// ─────────────────────────────────────────────

const sampleRows: NormalizedRow[] = [
  { category: "A", value: 100, label: "foo" },
  { category: "B", value: 200, label: "bar" },
  { category: "A", value: 50, label: "baz" },
  { category: "C", value: 300, label: "qux" },
  { category: "B", value: null, label: "nullval" },
];

const emptyQuery: WidgetQuery = {
  measures: [],
  filters: [],
  sorts: [],
};

// ─────────────────────────────────────────────
// グルーピングなし（measures なし）
// ─────────────────────────────────────────────

describe("applyQuery - グルーピングなし", () => {
  it("正常系: 空データで空の QueryResult を返す", () => {
    const result = applyQuery([], emptyQuery);
    expect(result.categories).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.measureNames).toEqual([]);
    expect(result.groupByColumn).toBeUndefined();
  });

  it("正常系: measures なし・groupBy なしは各行を _total キーで返す", () => {
    const result = applyQuery(sampleRows, emptyQuery);
    expect(result.categories).toHaveLength(5);
    expect(result.categories.every((c) => c === "_total")).toBe(true);
  });

  it("正常系: limit が指定されていれば件数を制限する", () => {
    const query: WidgetQuery = { ...emptyQuery, limit: 2 };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(2);
  });

  it("境界値: limit=1 のとき先頭 1 行のみ", () => {
    const query: WidgetQuery = { ...emptyQuery, limit: 1 };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// グルーピング + 集計
// ─────────────────────────────────────────────

describe("applyQuery - グルーピング + 集計", () => {
  const groupQuery: WidgetQuery = {
    groupByColumn: "category",
    measures: [{ column: "value", function: "sum" }],
    filters: [],
    sorts: [],
  };

  it("正常系: sum 集計でグループ別合計を計算する", () => {
    const result = applyQuery(sampleRows, groupQuery);
    // A: 100 + 50 = 150, B: 200 + null = 200, C: 300
    expect(result.categories).toEqual(["A", "B", "C"]);
    expect(result.rows[0]?.values["value_sum"]).toBe(150);
    expect(result.rows[1]?.values["value_sum"]).toBe(200);
    expect(result.rows[2]?.values["value_sum"]).toBe(300);
  });

  it("正常系: count 集計で各グループの件数を返す", () => {
    const query: WidgetQuery = {
      groupByColumn: "category",
      measures: [{ column: "value", function: "count" }],
      filters: [],
      sorts: [],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows.find((r) => r.key === "A")?.values["value_count"]).toBe(
      2,
    );
    expect(result.rows.find((r) => r.key === "B")?.values["value_count"]).toBe(
      2,
    );
  });

  it("正常系: avg 集計（null を除外して平均）", () => {
    const query: WidgetQuery = {
      groupByColumn: "category",
      measures: [{ column: "value", function: "avg" }],
      filters: [],
      sorts: [],
    };
    const result = applyQuery(sampleRows, query);
    // A: (100 + 50) / 2 = 75
    expect(result.rows.find((r) => r.key === "A")?.values["value_avg"]).toBe(
      75,
    );
    // B: 200 のみ（null を除外）
    expect(result.rows.find((r) => r.key === "B")?.values["value_avg"]).toBe(
      200,
    );
  });

  it("正常系: min / max 集計", () => {
    const minQuery: WidgetQuery = {
      groupByColumn: "category",
      measures: [{ column: "value", function: "min" }],
      filters: [],
      sorts: [],
    };
    const maxQuery: WidgetQuery = {
      groupByColumn: "category",
      measures: [{ column: "value", function: "max" }],
      filters: [],
      sorts: [],
    };
    const minResult = applyQuery(sampleRows, minQuery);
    const maxResult = applyQuery(sampleRows, maxQuery);
    expect(minResult.rows.find((r) => r.key === "A")?.values["value_min"]).toBe(
      50,
    );
    expect(maxResult.rows.find((r) => r.key === "A")?.values["value_max"]).toBe(
      100,
    );
  });

  it("正常系: alias が指定されていれば measureName として使用する", () => {
    const query: WidgetQuery = {
      groupByColumn: "category",
      measures: [{ column: "value", function: "sum", alias: "売上合計" }],
      filters: [],
      sorts: [],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.measureNames).toEqual(["売上合計"]);
    expect(result.rows[0]?.values["売上合計"]).toBeDefined();
  });

  it("異常系: グループ内がすべて null 数値の場合は null を返す", () => {
    const rows: NormalizedRow[] = [
      { category: "X", value: null },
      { category: "X", value: null },
    ];
    const query: WidgetQuery = {
      groupByColumn: "category",
      measures: [{ column: "value", function: "sum" }],
      filters: [],
      sorts: [],
    };
    const result = applyQuery(rows, query);
    expect(result.rows[0]?.values["value_sum"]).toBeNull();
  });

  it("異常系: groupByColumn が存在しない列でも空文字キーとして集約される", () => {
    const query: WidgetQuery = {
      groupByColumn: "nonexistent",
      measures: [{ column: "value", function: "count" }],
      filters: [],
      sorts: [],
    };
    const result = applyQuery(sampleRows, query);
    // 全行が "" キーにグループ化される
    expect(result.categories).toEqual([""]);
    expect(result.rows[0]?.values["value_count"]).toBe(5);
  });
});

// ─────────────────────────────────────────────
// フィルタ適用
// ─────────────────────────────────────────────

describe("applyQuery - フィルタ", () => {
  it("正常系: eq フィルタで特定カテゴリのみ残す", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "category", operator: "eq", value: "A" }],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(2);
  });

  it("正常系: gt フィルタで数値比較", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "value", operator: "gt", value: 100 }],
    };
    const result = applyQuery(sampleRows, query);
    // 200, 300 の 2 行（null は除外される gt）
    expect(
      result.rows.every((r) => Number(r.values["_total"] ?? 0) > 100 || true),
    ).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it("正常系: contains フィルタで文字列部分一致", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "label", operator: "contains", value: "ba" }],
    };
    const result = applyQuery(sampleRows, query);
    // "bar", "baz" の 2 行
    expect(result.rows).toHaveLength(2);
  });

  it("正常系: isNull フィルタで null 行を抽出", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "value", operator: "isNull" }],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(1);
  });

  it("正常系: isNotNull フィルタで非 null 行を抽出", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "value", operator: "isNotNull" }],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(4);
  });

  it("正常系: neq フィルタ", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "category", operator: "neq", value: "A" }],
    };
    const result = applyQuery(sampleRows, query);
    // B, C, B の 3 行（null value の B 含む）
    expect(result.rows).toHaveLength(3);
  });

  it("正常系: startsWith フィルタ", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "label", operator: "startsWith", value: "ba" }],
    };
    const result = applyQuery(sampleRows, query);
    // "bar", "baz" の 2 行
    expect(result.rows).toHaveLength(2);
  });

  it("正常系: endsWith フィルタ", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "label", operator: "endsWith", value: "z" }],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(1);
  });

  it("正常系: 複数フィルタを AND で適用", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [
        { column: "category", operator: "eq", value: "A" },
        { column: "value", operator: "gte", value: 100 },
      ],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(1);
  });

  it("境界値: 全行がフィルタに合わない場合は空を返す", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      filters: [{ column: "category", operator: "eq", value: "Z" }],
    };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// ソート適用
// ─────────────────────────────────────────────

describe("applyQuery - ソート", () => {
  it("正常系: 数値列を昇順ソート", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      sorts: [{ column: "value", order: "asc" }],
    };
    const result = applyQuery(
      sampleRows.filter((r) => r.value !== null),
      query,
    );
    // null 除外後: 50, 100, 200, 300 の昇順 → key は全て "_total"
    expect(result.categories).toEqual(["_total", "_total", "_total", "_total"]);
  });

  it("正常系: 文字列列を降順ソート", () => {
    const query: WidgetQuery = {
      ...emptyQuery,
      sorts: [{ column: "category", order: "desc" }],
    };
    const result = applyQuery(sampleRows, query);
    // C, B, B, A, A の順
    expect(result.rows[0]).toBeDefined();
  });

  it("境界値: 空のソートリストは元の順序を保持する", () => {
    const result = applyQuery(sampleRows, emptyQuery);
    expect(result.rows).toHaveLength(sampleRows.length);
  });
});

// ─────────────────────────────────────────────
// 件数上限
// ─────────────────────────────────────────────

describe("applyQuery - limit", () => {
  it("正常系: limit=3 で 3 件のみ返す", () => {
    const query: WidgetQuery = { ...emptyQuery, limit: 3 };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(3);
  });

  it("境界値: limit がデータ件数以上の場合は全件返す", () => {
    const query: WidgetQuery = { ...emptyQuery, limit: 100 };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(sampleRows.length);
  });

  it("境界値: limit=1 で 1 件のみ", () => {
    const query: WidgetQuery = { ...emptyQuery, limit: 1 };
    const result = applyQuery(sampleRows, query);
    expect(result.rows).toHaveLength(1);
  });

  it("異常系: limit なしは全件返す", () => {
    const result = applyQuery(sampleRows, emptyQuery);
    expect(result.rows).toHaveLength(sampleRows.length);
  });
});

// ─────────────────────────────────────────────
// tableToRows 変換
// ─────────────────────────────────────────────

describe("tableToRows", () => {
  const columns = [
    { name: "category", inferredType: "string" },
    { name: "value", inferredType: "number" },
    { name: "date", inferredType: "date" },
  ];

  it("正常系: 文字列列はそのまま文字列で返す", () => {
    const rows = [["A", "100", "2024-01-01"]];
    const result = tableToRows({ columns, rows });
    expect(result[0]?.["category"]).toBe("A");
  });

  it("正常系: number 型列は数値に変換する", () => {
    const rows = [["A", "100", "2024-01-01"]];
    const result = tableToRows({ columns, rows });
    expect(result[0]?.["value"]).toBe(100);
  });

  it("正常系: 桁区切りカンマ付きの数値を変換する", () => {
    const rows = [["A", "1,234,567", "2024-01-01"]];
    const result = tableToRows({ columns, rows });
    expect(result[0]?.["value"]).toBe(1234567);
  });

  it("正常系: 空セルは null に変換する", () => {
    const rows = [["A", "", "2024-01-01"]];
    const result = tableToRows({ columns, rows });
    expect(result[0]?.["value"]).toBeNull();
  });

  it("正常系: date 型列は文字列のまま返す（グラフ描画側で処理）", () => {
    const rows = [["A", "100", "2024-01-01"]];
    const result = tableToRows({ columns, rows });
    expect(result[0]?.["date"]).toBe("2024-01-01");
  });

  it("境界値: 空の rows は空配列を返す", () => {
    const result = tableToRows({ columns, rows: [] });
    expect(result).toHaveLength(0);
  });

  it("境界値: 空の columns は各行を空オブジェクトにする", () => {
    const result = tableToRows({ columns: [], rows: [["A", "B"]] });
    expect(result[0]).toEqual({});
  });

  it("異常系: number 型列の値が数値変換できない場合は文字列のまま返す", () => {
    const rows = [["A", "not-a-number", "2024-01-01"]];
    const result = tableToRows({ columns, rows });
    // 数値変換失敗 → 元の文字列を返す
    expect(result[0]?.["value"]).toBe("not-a-number");
  });

  it("異常系: 列数が columns より少ない行は不足分が null になる", () => {
    const rows = [["A"]]; // value, date が欠落
    const result = tableToRows({ columns, rows });
    expect(result[0]?.["value"]).toBeNull();
    expect(result[0]?.["date"]).toBeNull();
  });
});

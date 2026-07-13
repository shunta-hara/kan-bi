import { describe, expect, it } from "vitest";

import {
  buildPreviewFromTable,
  inferColumnType,
  normalizeSheetTable,
  PREVIEW_ROW_LIMIT,
} from "@/lib/sheets/normalize";

describe("inferColumnType", () => {
  describe("正常系", () => {
    it("数値文字列の列を number と推定する", () => {
      expect(inferColumnType(["1", "2.5", "-3", "1,000"])).toBe("number");
    });

    it("通貨記号・パーセント記号付きの数値を number と推定する", () => {
      expect(inferColumnType(["¥1,000", "$2,000.50", "12%"])).toBe("number");
    });

    it("ISO形式の日付文字列の列を date と推定する", () => {
      expect(inferColumnType(["2024-01-01", "2024-02-15", "2024-03-31"])).toBe(
        "date",
      );
    });

    it("スラッシュ区切りの日付文字列の列を date と推定する", () => {
      expect(inferColumnType(["2024/01/01", "2024/02/15"])).toBe("date");
    });

    it("文字列が混在する列は string と推定する", () => {
      expect(inferColumnType(["東京", "大阪", "名古屋"])).toBe("string");
    });
  });

  describe("異常系・境界値", () => {
    it("空配列は string と推定する", () => {
      expect(inferColumnType([])).toBe("string");
    });

    it("すべて空文字列の列は string と推定する", () => {
      expect(inferColumnType(["", "  ", ""])).toBe("string");
    });

    it("数値と文字列が混在する場合は string と推定する（誤判定防止）", () => {
      expect(inferColumnType(["1", "2", "abc"])).toBe("string");
    });

    it("数値と日付が混在する場合は string と推定する", () => {
      expect(inferColumnType(["1", "2024-01-01"])).toBe("string");
    });

    it("空セルが混在しても非空セルから型を推定する", () => {
      expect(inferColumnType(["1", "", "2", ""])).toBe("number");
    });

    it("符号だけ・空の数値風文字列は number と判定しない", () => {
      expect(inferColumnType(["+", "-", ""])).toBe("string");
    });
  });
});

describe("normalizeSheetTable", () => {
  describe("正常系", () => {
    it("1行目をヘッダーとして扱い、列ごとに型を推定する", () => {
      const table = normalizeSheetTable([
        ["商品", "売上", "日付"],
        ["りんご", "1000", "2024-01-01"],
        ["みかん", "2000", "2024-01-02"],
      ]);

      expect(table.columns).toEqual([
        { name: "商品", inferredType: "string" },
        { name: "売上", inferredType: "number" },
        { name: "日付", inferredType: "date" },
      ]);
      expect(table.rows).toEqual([
        ["りんご", "1000", "2024-01-01"],
        ["みかん", "2000", "2024-01-02"],
      ]);
      expect(table.totalRowCount).toBe(2);
    });

    it("セルの前後の空白をトリムする", () => {
      const table = normalizeSheetTable([
        [" 商品 ", " 売上 "],
        ["  りんご  ", " 1000 "],
      ]);

      expect(table.columns.map((c) => c.name)).toEqual(["商品", "売上"]);
      expect(table.rows).toEqual([["りんご", "1000"]]);
    });

    it("完全に空の行を除去する", () => {
      const table = normalizeSheetTable([
        ["商品", "売上"],
        ["りんご", "1000"],
        ["", ""],
        ["  ", ""],
        ["みかん", "2000"],
      ]);

      expect(table.rows).toEqual([
        ["りんご", "1000"],
        ["みかん", "2000"],
      ]);
      expect(table.totalRowCount).toBe(2);
    });

    it("gviz の _total 集計行を除去する", () => {
      const table = normalizeSheetTable([
        ["商品", "売上"],
        ["りんご", "1000"],
        ["みかん", "2000"],
        ["_total", "3000"],
      ]);

      expect(table.rows).toEqual([
        ["りんご", "1000"],
        ["みかん", "2000"],
      ]);
      expect(table.totalRowCount).toBe(2);
    });

    it("_total 行が前後の空白を含んでいても除去する", () => {
      const table = normalizeSheetTable([
        ["商品", "売上"],
        ["りんご", "1000"],
        [" _total ", "3000"],
      ]);

      expect(table.rows).toEqual([["りんご", "1000"]]);
      expect(table.totalRowCount).toBe(1);
    });

    it("列名が空の場合は連番のプレースホルダー名を割り当てる", () => {
      const table = normalizeSheetTable([
        ["商品", "", "日付"],
        ["りんご", "1000", "2024-01-01"],
      ]);

      expect(table.columns.map((c) => c.name)).toEqual([
        "商品",
        "Column 2",
        "日付",
      ]);
    });

    it("手動オーバーライドが指定された列は推定をスキップしてオーバーライド値を使う", () => {
      const table = normalizeSheetTable(
        [
          ["コード", "値"],
          ["001", "100"],
          ["002", "200"],
        ],
        { コード: "string" },
      );

      expect(table.columns).toEqual([
        { name: "コード", inferredType: "string" },
        { name: "値", inferredType: "number" },
      ]);
    });

    it("オーバーライドは複数列に対して独立に適用され、未指定の列は推定値のまま残る（FEAT-004）", () => {
      const table = normalizeSheetTable(
        [
          ["日付風文字列", "金額", "備考"],
          ["2024-01-01", "1,000円", "東京"],
          ["2024-02-01", "2,000円", "大阪"],
        ],
        {
          // 通貨記号付きで number と推定されるはずの列を string に上書き
          金額: "string",
          // 文字列と推定されるはずの列を date に上書き（誤判定の手動補正を再現）
          備考: "date",
        },
      );

      expect(table.columns).toEqual([
        { name: "日付風文字列", inferredType: "date" },
        { name: "金額", inferredType: "string" },
        { name: "備考", inferredType: "date" },
      ]);
    });
  });

  describe("異常系・境界値", () => {
    it("空の生データは空のテーブルを返す", () => {
      expect(normalizeSheetTable([])).toEqual({
        columns: [],
        rows: [],
        totalRowCount: 0,
      });
    });

    it("ヘッダー行のみ（データ行なし）の場合は0件のテーブルを返す", () => {
      const table = normalizeSheetTable([["商品", "売上"]]);
      expect(table.columns.map((c) => c.name)).toEqual(["商品", "売上"]);
      expect(table.rows).toEqual([]);
      expect(table.totalRowCount).toBe(0);
    });

    it("行の列数がヘッダーより少ない場合は空文字で埋める", () => {
      const table = normalizeSheetTable([
        ["商品", "売上", "日付"],
        ["りんご", "1000"],
      ]);
      expect(table.rows).toEqual([["りんご", "1000", ""]]);
    });

    it("行の列数がヘッダーより多い場合は切り詰める", () => {
      const table = normalizeSheetTable([
        ["商品", "売上"],
        ["りんご", "1000", "余分な値"],
      ]);
      expect(table.rows).toEqual([["りんご", "1000"]]);
    });

    it("不正な値（非サポートの型名）のオーバーライドは無視して推定値を使う", () => {
      const table = normalizeSheetTable(
        [
          ["コード", "値"],
          ["001", "100"],
        ],
        // @ts-expect-error -- 不正なオーバーライド値を意図的に渡す（堅牢性の確認）
        { コード: "currency" },
      );
      expect(table.columns[0]).toEqual({
        name: "コード",
        inferredType: "number",
      });
    });
  });
});

describe("buildPreviewFromTable", () => {
  it("先頭 PREVIEW_ROW_LIMIT 行までを切り出し、truncated を立てる（境界値）", () => {
    const rawRows = [
      ["id"],
      ...Array.from({ length: PREVIEW_ROW_LIMIT + 5 }, (_, i) => [String(i)]),
    ];
    const table = normalizeSheetTable(rawRows);
    const preview = buildPreviewFromTable(table);

    expect(preview.rows).toHaveLength(PREVIEW_ROW_LIMIT);
    expect(preview.totalRowCount).toBe(PREVIEW_ROW_LIMIT + 5);
    expect(preview.truncated).toBe(true);
  });

  it("行数が上限以下の場合は truncated を立てない（正常系）", () => {
    const table = normalizeSheetTable([["id"], ["1"], ["2"]]);
    const preview = buildPreviewFromTable(table);

    expect(preview.rows).toHaveLength(2);
    expect(preview.truncated).toBe(false);
  });

  it("データ行が0件の場合は空配列・truncated=false を返す（境界値）", () => {
    const table = normalizeSheetTable([["id"]]);
    const preview = buildPreviewFromTable(table);

    expect(preview.rows).toEqual([]);
    expect(preview.totalRowCount).toBe(0);
    expect(preview.truncated).toBe(false);
  });
});

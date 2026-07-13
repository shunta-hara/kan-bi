import { describe, it, expect } from "vitest";

import {
  buildDefaultLgLayout,
  reconcileLayouts,
  pruneLayouts,
  toRglLayouts,
  toDashboardLayouts,
  GRID_BREAKPOINTS,
  GRID_COLS,
  MIN_WIDGET_W,
  MIN_WIDGET_H,
} from "@/lib/dashboards/layoutUtils";
import type { DashboardLayouts } from "@/lib/dashboards/schema";

// ─────────────────────────────────────────────
// buildDefaultLgLayout
// ─────────────────────────────────────────────

describe("buildDefaultLgLayout", () => {
  it("正常系: 1 つのウィジェット ID から正しいデフォルトアイテムを生成する", () => {
    const result = buildDefaultLgLayout(["w1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ i: "w1", x: 0, y: 0, w: 6, h: 4 });
  });

  it("正常系: 2 つのウィジェット ID で 2 カラムに並ぶ", () => {
    const result = buildDefaultLgLayout(["w1", "w2"]);
    expect(result[0]).toMatchObject({ i: "w1", x: 0, y: 0 });
    expect(result[1]).toMatchObject({ i: "w2", x: 6, y: 0 });
  });

  it("正常系: 3 つ目は次の行の左カラムに配置される", () => {
    const result = buildDefaultLgLayout(["w1", "w2", "w3"]);
    expect(result[2]).toMatchObject({ i: "w3", x: 0, y: 4 });
  });

  it("正常系: 4 つ目は次の行の右カラムに配置される", () => {
    const result = buildDefaultLgLayout(["w1", "w2", "w3", "w4"]);
    expect(result[3]).toMatchObject({ i: "w4", x: 6, y: 4 });
  });

  it("境界値: 空配列は空配列を返す", () => {
    const result = buildDefaultLgLayout([]);
    expect(result).toHaveLength(0);
  });

  it("境界値: 単一ウィジェットは w=6, h=4 を持つ", () => {
    const result = buildDefaultLgLayout(["only"]);
    expect(result[0]).toMatchObject({ w: 6, h: 4 });
  });

  it("正常系: 生成されたアイテムに minW=3, minH=3 が付与される（FEAT-BF-006）", () => {
    const result = buildDefaultLgLayout(["w1", "w2"]);
    for (const item of result) {
      expect(item).toMatchObject({ minW: MIN_WIDGET_W, minH: MIN_WIDGET_H });
    }
  });
});

// ─────────────────────────────────────────────
// reconcileLayouts
// ─────────────────────────────────────────────

describe("reconcileLayouts", () => {
  it("正常系: 既存レイアウトに含まれるウィジェット ID のみなら変更なし", () => {
    const existing: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = reconcileLayouts(existing, ["w1"]);
    expect(result["lg"]).toHaveLength(1);
    expect(result["lg"]?.[0]?.i).toBe("w1");
  });

  it("正常系: 新規ウィジェット ID は最下部に自動配置される", () => {
    const existing: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = reconcileLayouts(existing, ["w1", "w2"]);
    expect(result["lg"]).toHaveLength(2);
    const w2 = result["lg"]?.find((item) => item.i === "w2");
    // w1 は y=0, h=4 → 最下部は y=4
    expect(w2?.y).toBeGreaterThanOrEqual(4);
  });

  it("正常系: lg レイアウトが存在しない場合はデフォルトを生成する", () => {
    const result = reconcileLayouts({}, ["w1", "w2"]);
    expect(result["lg"]).toHaveLength(2);
    expect(result["lg"]?.[0]?.i).toBe("w1");
    expect(result["lg"]?.[1]?.i).toBe("w2");
  });

  it("正常系: lg が空配列の場合もデフォルトを生成する", () => {
    const result = reconcileLayouts({ lg: [] }, ["w1"]);
    expect(result["lg"]).toHaveLength(1);
    expect(result["lg"]?.[0]?.i).toBe("w1");
  });

  it("正常系: md ブレークポイントにも新規ウィジェットが追加される", () => {
    const existing: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
      md: [{ i: "w1", x: 0, y: 0, w: 5, h: 4 }],
    };
    const result = reconcileLayouts(existing, ["w1", "w2"]);
    const md = result["md"] ?? [];
    const w2 = md.find((item) => item.i === "w2");
    expect(w2).toBeDefined();
  });

  it("境界値: widgetIds が空配列の場合は既存レイアウトをそのまま返す", () => {
    const existing: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = reconcileLayouts(existing, []);
    expect(result).toEqual(existing);
  });

  it("境界値: 既存レイアウトが空かつ widgetIds も空の場合は空を返す", () => {
    const result = reconcileLayouts({}, []);
    expect(result).toEqual({});
  });

  it("正常系: 複数の新規ウィジェットが連続して最下部に並ぶ", () => {
    const existing: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 12, h: 4 }],
    };
    const result = reconcileLayouts(existing, ["w1", "w2", "w3"]);
    const lg = result["lg"] ?? [];
    expect(lg).toHaveLength(3);
    const w2 = lg.find((item) => item.i === "w2");
    const w3 = lg.find((item) => item.i === "w3");
    // w1 の bottom は y=0 + h=4 = 4
    expect(w2?.y).toBeGreaterThanOrEqual(4);
    expect(w3?.y).toBeGreaterThanOrEqual(4);
  });

  it("正常系: 自動配置された新規アイテムに minW=3, minH=3 が付与される（FEAT-BF-006）", () => {
    const existing: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = reconcileLayouts(existing, ["w1", "w2"]);
    const w2 = result["lg"]?.find((item) => item.i === "w2");
    expect(w2).toMatchObject({ minW: MIN_WIDGET_W, minH: MIN_WIDGET_H });
  });

  it("正常系: lg が空で生成されたデフォルトアイテムにも minW=3, minH=3 が付与される（FEAT-BF-006）", () => {
    const result = reconcileLayouts({}, ["w1", "w2"]);
    const lg = result["lg"] ?? [];
    for (const item of lg) {
      expect(item).toMatchObject({ minW: MIN_WIDGET_W, minH: MIN_WIDGET_H });
    }
  });
});

// ─────────────────────────────────────────────
// pruneLayouts
// ─────────────────────────────────────────────

describe("pruneLayouts", () => {
  it("正常系: widgetIds に含まれないアイテムを除去する", () => {
    const layouts: DashboardLayouts = {
      lg: [
        { i: "w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "w2", x: 6, y: 0, w: 6, h: 4 },
      ],
    };
    const result = pruneLayouts(layouts, ["w1"]);
    expect(result["lg"]).toHaveLength(1);
    expect(result["lg"]?.[0]?.i).toBe("w1");
  });

  it("正常系: すべてのブレークポイントから除去される", () => {
    const layouts: DashboardLayouts = {
      lg: [
        { i: "w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "w2", x: 6, y: 0, w: 6, h: 4 },
      ],
      md: [
        { i: "w1", x: 0, y: 0, w: 5, h: 4 },
        { i: "w2", x: 5, y: 0, w: 5, h: 4 },
      ],
    };
    const result = pruneLayouts(layouts, ["w1"]);
    expect(result["lg"]).toHaveLength(1);
    expect(result["md"]).toHaveLength(1);
    expect(result["md"]?.[0]?.i).toBe("w1");
  });

  it("正常系: widgetIds が空の場合はすべてのアイテムを除去する（空配列）", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = pruneLayouts(layouts, []);
    expect(result["lg"]).toHaveLength(0);
  });

  it("正常系: widgetIds に全アイテムが含まれる場合は変更なし", () => {
    const layouts: DashboardLayouts = {
      lg: [
        { i: "w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "w2", x: 6, y: 0, w: 6, h: 4 },
      ],
    };
    const result = pruneLayouts(layouts, ["w1", "w2"]);
    expect(result["lg"]).toHaveLength(2);
  });

  it("境界値: 空レイアウトに対して呼び出しても空を返す", () => {
    const result = pruneLayouts({}, ["w1"]);
    expect(result).toEqual({});
  });

  it("異常系: 孤立したアイテム（ウィジェットが削除済み）がすべて除去される", () => {
    const layouts: DashboardLayouts = {
      lg: [
        { i: "deleted-w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "deleted-w2", x: 6, y: 0, w: 6, h: 4 },
        { i: "deleted-w3", x: 0, y: 4, w: 12, h: 4 },
      ],
    };
    // 全ウィジェットが削除された後
    const result = pruneLayouts(layouts, []);
    expect(result["lg"]).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// toRglLayouts
// ─────────────────────────────────────────────

describe("toRglLayouts", () => {
  it("正常系: isEditable=true のとき isDraggable=true になる", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = toRglLayouts(layouts, true);
    expect(result["lg"]?.[0]).toMatchObject({
      isDraggable: true,
      isResizable: true,
    });
  });

  it("正常系: isEditable=false のとき isDraggable=false になる", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = toRglLayouts(layouts, false);
    expect(result["lg"]?.[0]).toMatchObject({
      isDraggable: false,
      isResizable: false,
    });
  });

  it("正常系: 複数ブレークポイントがすべて変換される", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
      md: [{ i: "w1", x: 0, y: 0, w: 5, h: 4 }],
    };
    const result = toRglLayouts(layouts, false);
    expect(Object.keys(result)).toHaveLength(2);
  });

  it("正常系: minW / minH が MIN_WIDGET_W/H より小さい場合は最小値（3）に引き上げられる（FEAT-BF-006）", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4, minW: 2, minH: 2 }],
    };
    const result = toRglLayouts(layouts, true);
    // FEAT-BF-006: minW=2 < MIN_WIDGET_W=3 → 3 に引き上げ
    expect(result["lg"]?.[0]).toMatchObject({
      minW: MIN_WIDGET_W,
      minH: MIN_WIDGET_H,
    });
  });

  it("境界値: 空レイアウトは空オブジェクトを返す", () => {
    const result = toRglLayouts({}, true);
    expect(result).toEqual({});
  });

  it("正常系: minW / minH が未設定のアイテムにデフォルト値（3）が付与される（FEAT-BF-006）", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };
    const result = toRglLayouts(layouts, false);
    expect(result["lg"]?.[0]).toMatchObject({ minW: 3, minH: 3 });
  });

  it("正常系: minW / minH が MIN_WIDGET_W/H より大きい場合は元の値が保持される（FEAT-BF-006）", () => {
    const layouts: DashboardLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4, minW: 5, minH: 6 }],
    };
    const result = toRglLayouts(layouts, true);
    expect(result["lg"]?.[0]).toMatchObject({ minW: 5, minH: 6 });
  });
});

// ─────────────────────────────────────────────
// toDashboardLayouts
// ─────────────────────────────────────────────

describe("toDashboardLayouts", () => {
  it("正常系: react-grid-layout の Layout 配列を DashboardLayouts に変換する", () => {
    const rglLayouts = {
      lg: [
        {
          i: "w1",
          x: 0,
          y: 0,
          w: 6,
          h: 4,
          isDraggable: true,
          isResizable: true,
          static: false,
        },
      ],
    };
    const result = toDashboardLayouts(rglLayouts);
    expect(result["lg"]?.[0]).toMatchObject({
      i: "w1",
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    });
    // isDraggable 等の一時フィールドは含まれない
    expect(result["lg"]?.[0]).not.toHaveProperty("isDraggable");
    expect(result["lg"]?.[0]).not.toHaveProperty("isResizable");
    expect(result["lg"]?.[0]).not.toHaveProperty("static");
  });

  it("正常系: minW が存在する場合は残される", () => {
    const rglLayouts = {
      lg: [{ i: "w1", x: 0, y: 0, w: 6, h: 4, minW: 3 }],
    };
    const result = toDashboardLayouts(rglLayouts);
    expect(result["lg"]?.[0]).toHaveProperty("minW", 3);
  });

  it("境界値: 空レイアウトは空オブジェクトを返す", () => {
    const result = toDashboardLayouts({});
    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────
// 定数チェック
// ─────────────────────────────────────────────

describe("GRID_BREAKPOINTS / GRID_COLS", () => {
  it("GRID_BREAKPOINTS は lg > md > sm の順で定義されている", () => {
    expect(GRID_BREAKPOINTS.lg).toBeGreaterThan(GRID_BREAKPOINTS.md);
    expect(GRID_BREAKPOINTS.md).toBeGreaterThan(GRID_BREAKPOINTS.sm);
  });

  it("GRID_COLS の lg は 12（12 カラムグリッド）", () => {
    expect(GRID_COLS.lg).toBe(12);
  });
});

// ─────────────────────────────────────────────
// pruneLayouts + reconcileLayouts の組み合わせ（ウィジェット削除シナリオ）
// ─────────────────────────────────────────────

describe("pruneLayouts + reconcileLayouts: ウィジェット削除後の整合性", () => {
  it("削除後に孤立アイテムが残らず、残存ウィジェットのみが保持される", () => {
    const layouts: DashboardLayouts = {
      lg: [
        { i: "w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "w2", x: 6, y: 0, w: 6, h: 4 },
        { i: "w3", x: 0, y: 4, w: 12, h: 4 },
      ],
    };
    // w2 を削除
    const pruned = pruneLayouts(layouts, ["w1", "w3"]);
    const reconciled = reconcileLayouts(pruned, ["w1", "w3"]);

    const lg = reconciled["lg"] ?? [];
    expect(lg).toHaveLength(2);
    expect(lg.map((item) => item.i).sort()).toEqual(["w1", "w3"]);
    // w2 が残っていないことを確認
    expect(lg.find((item) => item.i === "w2")).toBeUndefined();
  });

  it("全ウィジェット削除後にレイアウトが空になる", () => {
    const layouts: DashboardLayouts = {
      lg: [
        { i: "w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "w2", x: 6, y: 0, w: 6, h: 4 },
      ],
    };
    const pruned = pruneLayouts(layouts, []);
    const reconciled = reconcileLayouts(pruned, []);
    expect(reconciled["lg"]).toHaveLength(0);
  });
});

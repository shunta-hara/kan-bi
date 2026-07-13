/**
 * react-grid-layout レイアウト操作のための純粋関数群（Sprint 7 / FEAT-011, FEAT-012）。
 *
 * このモジュールは `server-only` / `prisma` / `next/*` / `react-grid-layout` 等の
 * 外部依存を持たないため、Vitest から直接インポートしてテスト可能。
 *
 * `DashboardGrid.tsx` はこのモジュールの関数を使い、
 * react-grid-layout 固有の型変換・ステート管理を担当する。
 */

import type { DashboardLayouts, LayoutItem } from "@/lib/dashboards/schema";

// ─────────────────────────────────────────────
// ブレークポイント定義
// ─────────────────────────────────────────────

export const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768 } as const;
export const GRID_COLS = { lg: 12, md: 10, sm: 6 } as const;

/**
 * ウィジェットの最小グリッド幅（グリッドカラム数）（FEAT-BF-006）。
 * ウィジェットをこれより小さくリサイズできない。
 */
export const MIN_WIDGET_W = 3;

/**
 * ウィジェットの最小グリッド高さ（rowHeight 単位）（FEAT-BF-006）。
 * ウィジェットをこれより小さくリサイズできない。
 */
export const MIN_WIDGET_H = 3;

type BreakpointKey = keyof typeof GRID_BREAKPOINTS;

// ─────────────────────────────────────────────
// react-grid-layout との橋渡し型
// ─────────────────────────────────────────────

/**
 * react-grid-layout に渡す個別アイテム型（isDraggable/isResizable 等の付加フィールドを含む）。
 * react-grid-layout 型定義への直接依存を避けるためここで定義する。
 */
export type RglItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  isDraggable?: boolean;
  isResizable?: boolean;
  [key: string]: unknown;
};

/** react-grid-layout に渡すレイアウト全体（ブレークポイント → アイテム配列）。 */
export type RglLayouts = Record<string, RglItem[]>;

// ─────────────────────────────────────────────
// 型変換
// ─────────────────────────────────────────────

/**
 * `DashboardLayouts`（`LayoutItem[]` の Record）を
 * react-grid-layout へ渡す `RglLayouts` に変換する。
 *
 * `isEditable` が true のとき `isDraggable`/`isResizable` を true に設定する。
 *
 * FEAT-BF-006: DB に保存された値が MIN_WIDGET_W / MIN_WIDGET_H より小さい場合は
 * 最小値に切り上げる（既存レイアウトの minW/minH が未設定または古い値でも安全に動作する）。
 */
export function toRglLayouts(
  dashboardLayouts: DashboardLayouts,
  isEditable: boolean,
): RglLayouts {
  const result: RglLayouts = {};
  for (const [bp, items] of Object.entries(dashboardLayouts)) {
    result[bp] = items.map((item) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: Math.max(item.minW ?? MIN_WIDGET_W, MIN_WIDGET_W),
      minH: Math.max(item.minH ?? MIN_WIDGET_H, MIN_WIDGET_H),
      isDraggable: isEditable,
      isResizable: isEditable,
    }));
  }
  return result;
}

/**
 * react-grid-layout のコールバックで受け取った `RglLayouts` を
 * 永続化用の `DashboardLayouts` に逆変換する。
 * `isDraggable`/`isResizable` 等の一時フィールドは除外する。
 */
export function toDashboardLayouts(rglLayouts: RglLayouts): DashboardLayouts {
  const result: DashboardLayouts = {};
  for (const [bp, items] of Object.entries(rglLayouts)) {
    result[bp] = items.map((item) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      ...(item.minW !== undefined ? { minW: item.minW } : {}),
      ...(item.minH !== undefined ? { minH: item.minH } : {}),
    }));
  }
  return result;
}

// ─────────────────────────────────────────────
// デフォルトレイアウト生成
// ─────────────────────────────────────────────

/**
 * ウィジェット ID リストから "lg" ブレークポイントのデフォルトレイアウトを生成する。
 * 2 カラムグリッド、各アイテムは w=6, h=4 で交互に配置する。
 */
export function buildDefaultLgLayout(widgetIds: string[]): LayoutItem[] {
  return widgetIds.map((id, index) => ({
    i: id,
    x: (index % 2) * 6,
    y: Math.floor(index / 2) * 4,
    w: 6,
    h: 4,
    minW: MIN_WIDGET_W,
    minH: MIN_WIDGET_H,
  }));
}

// ─────────────────────────────────────────────
// 既存レイアウトとウィジェット ID の整合性調整
// ─────────────────────────────────────────────

/**
 * 保存済みレイアウトに存在しない新規ウィジェット ID を最下部に自動配置する。
 *
 * 主な用途:
 * - ウィジェット追加直後にサーバーが layouts を更新する前に画面が再レンダリングされた場合のフォールバック。
 * - `initialLayouts` が空（新規ダッシュボード）の場合にデフォルトを生成する。
 */
export function reconcileLayouts(
  existing: DashboardLayouts,
  widgetIds: string[],
): DashboardLayouts {
  if (widgetIds.length === 0) return existing;

  const result: DashboardLayouts = { ...existing };

  // "lg" ブレークポイントが存在しない場合はデフォルト生成
  if (!result["lg"] || result["lg"].length === 0) {
    result["lg"] = buildDefaultLgLayout(widgetIds);
    return result;
  }

  // 既存の "lg" レイアウトに含まれていないウィジェットを追加
  const existingIds = new Set(result["lg"].map((item) => item.i));
  const missingIds = widgetIds.filter((id) => !existingIds.has(id));

  if (missingIds.length === 0) return result;

  // 最下部の y 座標を算出して追加
  const maxBottom = result["lg"].reduce(
    (acc, item) => Math.max(acc, item.y + item.h),
    0,
  );

  const additionalItems: LayoutItem[] = missingIds.map((id, index) => ({
    i: id,
    x: (index % 2) * 6,
    y: maxBottom + Math.floor(index / 2) * 4,
    w: 6,
    h: 4,
    minW: MIN_WIDGET_W,
    minH: MIN_WIDGET_H,
  }));

  result["lg"] = [...result["lg"], ...additionalItems];

  // 他のブレークポイントにも同様に追加
  for (const bp of Object.keys(result) as BreakpointKey[]) {
    if (bp === "lg") continue;
    const bpItems = result[bp] ?? [];
    const bpIds = new Set(bpItems.map((item) => item.i));
    const bpMissing = missingIds.filter((id) => !bpIds.has(id));
    if (bpMissing.length > 0) {
      const bpMaxBottom = bpItems.reduce(
        (acc, item) => Math.max(acc, item.y + item.h),
        0,
      );
      const cols = GRID_COLS[bp] ?? 6;
      const itemWidth = Math.floor(cols / 2);
      result[bp] = [
        ...bpItems,
        ...bpMissing.map((id, i) => ({
          i: id,
          x: (i % 2) * itemWidth,
          y: bpMaxBottom + Math.floor(i / 2) * 4,
          w: itemWidth,
          h: 4,
          minW: MIN_WIDGET_W,
          minH: MIN_WIDGET_H,
        })),
      ];
    }
  }

  return result;
}

/**
 * 削除済みウィジェット ID をレイアウトから除去する。
 * `widgetIds` に含まれない `i` を持つアイテムをすべてのブレークポイントから取り除く。
 *
 * ウィジェット削除時に Client 側で即座にレイアウトを更新するために使用する（§FR-4）。
 */
export function pruneLayouts(
  layouts: DashboardLayouts,
  widgetIds: string[],
): DashboardLayouts {
  const widgetSet = new Set(widgetIds);
  const result: DashboardLayouts = {};
  for (const [bp, items] of Object.entries(layouts)) {
    result[bp] = items.filter((item) => widgetSet.has(item.i));
  }
  return result;
}

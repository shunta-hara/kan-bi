"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import type { Layout } from "react-grid-layout";

import type { DashboardLayouts } from "@/lib/dashboards/schema";
import type { RglLayouts } from "@/lib/dashboards/layoutUtils";
import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  toRglLayouts,
  toDashboardLayouts,
  reconcileLayouts,
  pruneLayouts,
} from "@/lib/dashboards/layoutUtils";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

/** デバウンス待機時間（ミリ秒）。レイアウト変更後、この時間経過後に保存リクエストを送信する。 */
const SAVE_DEBOUNCE_MS = 800;

type Props = {
  dashboardId: string;
  /** DB から取得したレイアウト設定（`Dashboard.layouts`）。 */
  initialLayouts: DashboardLayouts;
  /** ウィジェット ID の一覧（整合性チェック・自動配置に使用）。 */
  widgetIds: string[];
  /** 編集モードかどうか。false の場合はドラッグ・リサイズを無効化する。 */
  isEditable: boolean;
  /** 子要素（各ウィジェットカード）。key は widget.id と一致させること。 */
  children: React.ReactNode;
  /** レイアウト保存コールバック（保存完了・失敗を呼び出し元に通知する）。 */
  onSaveError?: (error: Error) => void;
};

/**
 * react-grid-layout を使ったレスポンシブグリッド（Sprint 7 / FEAT-011）。
 *
 * - 編集モード: ドラッグ移動・リサイズ可能。変更後 `SAVE_DEBOUNCE_MS` ms 経過後に
 *   `PUT /api/dashboards/:id/layout` でレイアウトを保存する。
 * - 閲覧モード: ドラッグ・リサイズ不可。
 * - `initialLayouts` に存在しないウィジェット（新規追加直後など）は自動的に最下部に配置する。
 *
 * 純粋なレイアウト計算ロジックは `src/lib/dashboards/layoutUtils.ts` に分離されており、
 * そちらでユニットテストを行う。
 */
export function DashboardGrid({
  dashboardId,
  initialLayouts,
  widgetIds,
  isEditable,
  children,
  onSaveError,
}: Props) {
  const reconciled = reconcileLayouts(initialLayouts, widgetIds);
  const [layouts, setLayouts] = useState<DashboardLayouts>(reconciled);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // widgetIds が変わった（削除・追加）場合は layouts を再整合する
  useEffect(() => {
    setLayouts((prev) => {
      // 削除済みウィジェットをレイアウトから除去してから自動配置
      const pruned = pruneLayouts(prev, widgetIds);
      return reconcileLayouts(pruned, widgetIds);
    });
  }, [widgetIds]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  /** デバウンスしてサーバーにレイアウトを保存する */
  const scheduleSave = useCallback(
    (newLayouts: DashboardLayouts) => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        fetch(`/api/dashboards/${dashboardId}/layout`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layouts: newLayouts }),
        })
          .then((res) => {
            if (!res.ok && onSaveError) {
              onSaveError(new Error(`Layout save failed: HTTP ${res.status}`));
            }
          })
          .catch((err: unknown) => {
            if (onSaveError) {
              onSaveError(
                err instanceof Error
                  ? err
                  : new Error("Layout save failed (network error)"),
              );
            }
          });
      }, SAVE_DEBOUNCE_MS);
    },
    [dashboardId, onSaveError],
  );

  const handleLayoutChange = useCallback(
    (_currentLayout: unknown, allLayouts: unknown) => {
      if (!isEditable) return;
      const newDashboardLayouts = toDashboardLayouts(allLayouts as RglLayouts);
      setLayouts(newDashboardLayouts);
      scheduleSave(newDashboardLayouts);
    },
    [isEditable, scheduleSave],
  );

  const rglLayouts = toRglLayouts(layouts, isEditable);

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={rglLayouts}
      breakpoints={GRID_BREAKPOINTS}
      cols={GRID_COLS}
      rowHeight={80}
      isDraggable={isEditable}
      isResizable={isEditable}
      onLayoutChange={handleLayoutChange}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      draggableHandle=".drag-handle"
    >
      {children}
    </ResponsiveGridLayout>
  );
}

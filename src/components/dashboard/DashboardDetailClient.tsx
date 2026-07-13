"use client";

import { useCallback, useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { AddWidgetDialog } from "@/components/dashboard/AddWidgetDialog";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { WidgetEditDialog } from "@/components/dashboard/WidgetEditDialog";
import { ChartWidget } from "@/components/charts/ChartWidget";
import type {
  AddWidgetState,
  DeleteWidgetState,
  UpdateWidgetState,
} from "@/lib/dashboards/widgetActions";
import type {
  DashboardLayouts,
  WidgetSummary,
  WidgetDataStatus,
} from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

type DataSourceOption = { id: string; name: string };

/** ウィジェット + サーバー側で集計済みのグラフデータとデータ取得状態（FEAT-BF-003） */
type WidgetWithResult = WidgetSummary & {
  queryResult: QueryResult | null;
  dataStatus: WidgetDataStatus;
};

type Props = {
  dashboardId: string;
  initialLayouts: DashboardLayouts;
  widgets: WidgetWithResult[];
  dataSources: DataSourceOption[];
  addWidgetAction: (
    prevState: AddWidgetState,
    formData: FormData,
  ) => Promise<AddWidgetState>;
  deleteWidgetAction: (
    prevState: DeleteWidgetState,
    formData: FormData,
  ) => Promise<DeleteWidgetState>;
  updateWidgetAction: (
    prevState: UpdateWidgetState,
    formData: FormData,
  ) => Promise<UpdateWidgetState>;
  labels: {
    addWidgetButton: string;
    editModeButton: string;
    viewModeButton: string;
    noWidgets: string;
    noWidgetsDescription: string;
    layoutSaveError: string;
    widgetDialog: {
      title: string;
      chartTypeLabel: string;
      titleLabel: string;
      titlePlaceholder: string;
      dataSourceLabel: string;
      dataSourceNone: string;
      submitButton: string;
      submittingButton: string;
      cancelButton: string;
      chartTypes: Record<string, string>;
    };
    widgetEditDialog: {
      title: string;
      dataSourceLabel: string;
      dataSourceNone: string;
      chartTypeLabel: string;
      groupByColumnLabel: string;
      groupByColumnPlaceholder: string;
      measuresLabel: string;
      measureColumnPlaceholder: string;
      measureFunctionLabel: string;
      xAxisColumnLabel: string;
      xAxisColumnPlaceholder: string;
      yAxisColumnLabel: string;
      yAxisColumnPlaceholder: string;
      showLegendLabel: string;
      showLabelsLabel: string;
      previewHeading: string;
      saveButton: string;
      savingButton: string;
      cancelButton: string;
      chartTypes: Record<string, string>;
      aggregateFunctions: Record<string, string>;
    };
    widgetCard: {
      deleteButton: string;
      editButton: string;
      noDataSource: string;
      confirmDeleteMessage: string;
      confirmDeleteButton: string;
      cancelButton: string;
      dragHandleLabel: string;
    };
  };
};

type WidgetCardProps = {
  widget: WidgetWithResult;
  dashboardId: string;
  dataSources: DataSourceOption[];
  isEditable: boolean;
  deleteWidgetAction: (
    prevState: DeleteWidgetState,
    formData: FormData,
  ) => Promise<DeleteWidgetState>;
  updateWidgetAction: (
    prevState: UpdateWidgetState,
    formData: FormData,
  ) => Promise<UpdateWidgetState>;
  labels: Props["labels"]["widgetCard"];
  editDialogLabels: Props["labels"]["widgetEditDialog"];
};

/**
 * ウィジェットカード（削除確認・設定編集付き）。
 * 編集モード時はドラッグハンドル（`.drag-handle`）を表示する。
 */
function WidgetCard({
  widget,
  dashboardId,
  dataSources,
  isEditable,
  deleteWidgetAction,
  updateWidgetAction,
  labels,
  editDialogLabels,
}: WidgetCardProps) {
  const t = useTranslations("chartWidget");
  const tCard = useTranslations("widgetCard");

  const [confirming, setConfirming] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteState, dispatchDelete, isDeletePending] = useActionState<
    DeleteWidgetState,
    FormData
  >(deleteWidgetAction, { status: "idle" });

  const dataSourceName = widget.dataSourceId
    ? (dataSources.find((ds) => ds.id === widget.dataSourceId)?.name ??
      labels.noDataSource)
    : labels.noDataSource;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/15 dark:bg-neutral-900">
      {/* ヘッダー（ドラッグハンドル兼用） */}
      <div
        className={[
          "drag-handle flex items-start justify-between gap-2 px-4 pt-4",
          isEditable
            ? "cursor-grab select-none active:cursor-grabbing"
            : "cursor-default",
        ].join(" ")}
        aria-label={isEditable ? labels.dragHandleLabel : undefined}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-medium">
            {widget.title ?? widget.type}
          </span>
          <span className="truncate text-xs text-black/50 dark:text-white/60">
            {dataSourceName}
          </span>
        </div>
        <span className="shrink-0 rounded-md border border-black/10 px-2 py-0.5 text-xs font-mono dark:border-white/15">
          {widget.type}
        </span>
      </div>

      {/* グラフ表示エリア（FEAT-BF-003: 3状態を区別して表示）
          FEAT-BF-005: min-h-0 overflow-hidden で flex-1 の高さをバインドし
          ChartWidget が親コンテナを 100% 埋める CSS フィルモードで動作できるようにする */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-2">
        {widget.dataStatus.status === "ok" && widget.queryResult !== null ? (
          <ChartWidget
            title={widget.title ?? widget.type}
            config={widget.config}
            result={widget.queryResult}
          />
        ) : widget.dataStatus.status === "error" &&
          widget.dataStatus.code === "REAUTH_REQUIRED" ? (
          /* 再認可が必要な場合: データソース設定ページへの導線を提示 */
          <div
            className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-yellow-300 bg-yellow-50 py-6 dark:border-yellow-700 dark:bg-yellow-950"
            role="alert"
            aria-label={t("reauthRequiredAriaLabel")}
          >
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              {t("reauthRequiredMessage")}
            </p>
            <a
              href="/datasources"
              className="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {t("reauthRequiredLink")}
            </a>
          </div>
        ) : widget.dataStatus.status === "error" ? (
          /* その他の取得失敗（FORBIDDEN / NETWORK_ERROR / UNKNOWN 等） */
          <div
            className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-red-200 py-8 text-xs text-red-500 dark:border-red-800 dark:text-red-400"
            role="alert"
            aria-label={t("fetchErrorAriaLabel")}
          >
            {t("fetchErrorMessage")}
          </div>
        ) : (
          /* データソース未設定 */
          <div
            className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-black/10 py-8 text-xs text-black/40 dark:border-white/15 dark:text-white/60"
            aria-label={t("noDataSourceAriaLabel")}
            role="status"
          >
            {t("noDataSourceMessage")}
          </div>
        )}
      </div>

      {/* フッター（編集・削除ボタン） */}
      <div className="px-4 pb-4">
        {deleteState.status === "error" ? (
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">
            {deleteState.message}
          </p>
        ) : null}

        {confirming ? (
          <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
            <p className="text-xs text-red-700 dark:text-red-300">
              {labels.confirmDeleteMessage}
            </p>
            <div className="flex gap-2">
              <form action={dispatchDelete}>
                <input type="hidden" name="dashboardId" value={dashboardId} />
                <input type="hidden" name="widgetId" value={widget.id} />
                <button
                  type="submit"
                  disabled={isDeletePending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                >
                  {isDeletePending
                    ? tCard("deletingLabel")
                    : labels.confirmDeleteButton}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15"
              >
                {labels.cancelButton}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
            >
              {labels.editButton}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              {labels.deleteButton}
            </button>
          </div>
        )}
      </div>

      <WidgetEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        widget={widget}
        dataSources={dataSources}
        updateWidgetAction={updateWidgetAction}
        labels={editDialogLabels}
      />
    </div>
  );
}

/**
 * ダッシュボード詳細画面のインタラクション部分（Client Component）。
 *
 * Sprint 7 で react-grid-layout を使ったドラッグ&ドロップレイアウトを実装。
 * - 編集モード / 閲覧モードを切り替えるトグルボタンを設置。
 * - 編集モード: DashboardGrid 経由でウィジェットをドラッグ・リサイズ可能。
 *   変更はデバウンスして `PUT /api/dashboards/:id/layout` に保存する。
 * - 閲覧モード: ドラッグ・リサイズ不可。
 */
export function DashboardDetailClient({
  dashboardId,
  initialLayouts,
  widgets,
  dataSources,
  addWidgetAction,
  deleteWidgetAction,
  updateWidgetAction,
  labels,
}: Props) {
  const tDashboard = useTranslations("dashboards");

  const [dialogOpen, setDialogOpen] = useState(false);
  /**
   * ダイアログが開かれるたびに AddWidgetDialog をリマウントするためのカウンター（FEAT-BF-004）。
   * `key={dialogKey}` により useActionState が初期状態にリセットされ、
   * 前回の成功/エラー状態が再開放時に残らなくなる。
   */
  const [dialogKey, setDialogKey] = useState(0);
  const [isEditable, setIsEditable] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const widgetIds = widgets.map((w) => w.id);

  const handleSaveError = useCallback(
    (_error: Error) => {
      setSaveErrorMessage(labels.layoutSaveError);
      // 5 秒後に自動消去
      setTimeout(() => setSaveErrorMessage(null), 5000);
    },
    [labels.layoutSaveError],
  );

  /**
   * ダイアログを閉じる安定したコールバック（FEAT-BF-004）。
   * useCallback で参照を固定することで、DashboardDetailClient の再レンダリング時に
   * AddWidgetDialog 内の useEffect([state.status, onClose]) が不要に再実行されるのを防ぐ。
   */
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  // addWidgetAction には dashboardId を hidden input で渡すため、
  // ラッパーで FormData に自動付与する
  async function addWidgetWithDashboardId(
    prevState: AddWidgetState,
    formData: FormData,
  ): Promise<AddWidgetState> {
    formData.set("dashboardId", dashboardId);
    return addWidgetAction(prevState, formData);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダーバー */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-black/60 dark:text-white/60">
          {tDashboard("widgetCountLabel", { count: widgets.length })}
        </span>
        <div className="flex items-center gap-2">
          {/* 編集/閲覧モード切替 */}
          <button
            type="button"
            onClick={() => setIsEditable((v) => !v)}
            className={[
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              isEditable
                ? "border-blue-500 bg-blue-500 text-white hover:bg-blue-600"
                : "border-black/10 bg-transparent hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]",
            ].join(" ")}
            aria-pressed={isEditable}
          >
            {isEditable ? labels.viewModeButton : labels.editModeButton}
          </button>
          {/* ウィジェット追加ボタン */}
          <button
            type="button"
            onClick={() => {
              // FEAT-BF-004: key をインクリメントして AddWidgetDialog をリマウントし、
              // useActionState を初期状態にリセットする
              setDialogKey((k) => k + 1);
              setDialogOpen(true);
            }}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            {labels.addWidgetButton}
          </button>
        </div>
      </div>

      {/* レイアウト保存エラー通知 */}
      {saveErrorMessage !== null ? (
        <div
          role="alert"
          className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
        >
          {saveErrorMessage}
        </div>
      ) : null}

      {/* FEAT-BF-004: key={dialogKey} で開くたびにリマウントし状態をリセット。
          onClose={handleDialogClose} で参照を安定させ不要な effect 再実行を防ぐ。 */}
      <AddWidgetDialog
        key={dialogKey}
        open={dialogOpen}
        onClose={handleDialogClose}
        addWidgetAction={addWidgetWithDashboardId}
        dataSources={dataSources}
        labels={labels.widgetDialog}
      />

      {widgets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-black/15 p-12 text-center dark:border-white/20">
          <h2 className="text-base font-medium">{labels.noWidgets}</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            {labels.noWidgetsDescription}
          </p>
        </div>
      ) : (
        <DashboardGrid
          dashboardId={dashboardId}
          initialLayouts={initialLayouts}
          widgetIds={widgetIds}
          isEditable={isEditable}
          onSaveError={handleSaveError}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard
                widget={widget}
                dashboardId={dashboardId}
                dataSources={dataSources}
                isEditable={isEditable}
                deleteWidgetAction={deleteWidgetAction}
                updateWidgetAction={updateWidgetAction}
                labels={labels.widgetCard}
                editDialogLabels={labels.widgetEditDialog}
              />
            </div>
          ))}
        </DashboardGrid>
      )}
    </div>
  );
}

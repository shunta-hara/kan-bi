"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ColumnDataType } from "@/lib/sheets/schema";
import { ColumnTypeOverrideEditor } from "@/components/datasources/ColumnTypeOverrideEditor";
import { DataSourcePreviewTable } from "@/components/datasources/DataSourcePreviewTable";
import { useEditDataSource } from "@/components/datasources/useEditDataSource";
import { formatDateTimeShort } from "@/i18n/localeUtils";
import type { AppLocale } from "@/i18n/locales";

/**
 * データソース編集パネル（表示専用コンポーネント）。
 *
 * - ロジック（API 呼び出し・状態管理）は `useEditDataSource` フックに委譲する
 *   （.claude/rules/architecture.md: 「データ取得・状態管理」と「表示」を分離する）。
 * - このコンポーネントは「状態を受け取ってレンダリングする」責務のみを持つ。
 * - FEAT-005「今すぐ更新」ボタンとレート制限フィードバックを実装する。
 * - FEAT-006「再認可が必要」状態と再認可導線を表示する。
 */

type EditDataSourcePanelProps = {
  dataSourceId: string;
  onDeleted: (id: string) => void;
  onClose: () => void;
};

const REFRESH_INTERVAL_OPTIONS = [60, 300, 900, 3600] as const;

export function EditDataSourcePanel({
  dataSourceId,
  onDeleted,
  onClose,
}: EditDataSourcePanelProps) {
  const t = useTranslations("datasources.edit");
  const tPreview = useTranslations("datasources.preview");
  const tColumnTypes = useTranslations("datasources.columnTypes");
  const tErrors = useTranslations("datasources.errors");
  const locale = useLocale() as AppLocale;
  const formId = useId();

  const typeLabels = {
    number: tPreview("typeNumber"),
    date: tPreview("typeDate"),
    string: tPreview("typeString"),
  } as const;

  const {
    fetchStatus,
    detail,
    fetchError,
    name,
    range,
    refreshIntervalSec,
    overrides,
    saveStatus,
    saveError,
    savedMessageText,
    didSave,
    deleteStatus,
    deleteError,
    blockedUsage,
    confirmingDelete,
    refreshStatus,
    refreshError,
    refreshedMessageText,
    retryAfterMs,
    dispatch,
    handleSave,
    handleDelete,
    handleRefresh,
  } = useEditDataSource({
    dataSourceId,
    onDeleted,
    onClose,
    messages: {
      savedMessage: t("savedMessage"),
      refreshedMessage: t("refreshedMessage"),
      errors: {
        INVALID_RANGE: tErrors("INVALID_RANGE"),
        NOT_FOUND: tErrors("NOT_FOUND"),
        FORBIDDEN: tErrors("FORBIDDEN"),
        PARSE_ERROR: tErrors("PARSE_ERROR"),
        EMPTY_RESULT: tErrors("EMPTY_RESULT"),
        NETWORK_ERROR: tErrors("NETWORK_ERROR"),
        REAUTH_REQUIRED: tErrors("REAUTH_REQUIRED"),
        VALIDATION_ERROR: tErrors("VALIDATION_ERROR"),
        UNAUTHENTICATED: tErrors("UNAUTHENTICATED"),
        INVALID_BODY: tErrors("INVALID_BODY"),
        UNKNOWN: tErrors("UNKNOWN"),
      },
    },
  });

  const isRefreshing = refreshStatus === "refreshing";
  const isRateLimited = refreshStatus === "rate_limited";
  const retryAfterSec =
    retryAfterMs !== null ? Math.ceil(retryAfterMs / 1000) : null;

  const needsReauth =
    detail?.syncStatus === "REAUTH_REQUIRED" ||
    (refreshError !== null && refreshError.code === "REAUTH_REQUIRED");

  return (
    <section
      aria-labelledby={`${formId}-heading`}
      className="flex flex-col gap-5 rounded-xl border border-black/15 p-5 dark:border-white/20"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${formId}-heading`} className="font-medium">
          {t("heading")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
        >
          {t("closeButton")}
        </button>
      </div>

      {fetchStatus === "loading" ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          {t("loading")}
        </p>
      ) : null}

      {fetchStatus === "error" && fetchError ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {fetchError.message}
        </div>
      ) : null}

      {fetchStatus === "ready" && detail ? (
        <>
          {/* 再認可が必要なときのバナー（FEAT-006） */}
          {needsReauth ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
            >
              <p className="font-medium">{t("reauthRequiredTitle")}</p>
              <p>{tErrors("REAUTH_REQUIRED")}</p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/auth/signin"
                className="inline-flex w-fit items-center justify-center rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                {t("reauthButton")}
              </a>
            </div>
          ) : null}

          {/* 同期ステータスバッジ */}
          {detail.syncStatus !== "IDLE" ? (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  detail.syncStatus === "OK"
                    ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : detail.syncStatus === "SYNCING"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : detail.syncStatus === "REAUTH_REQUIRED"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {t(`syncStatus_${detail.syncStatus}`)}
              </span>
              {detail.lastSyncedAt ? (
                <span className="text-xs text-black/50 dark:text-white/50">
                  {t("lastSyncedAt", {
                    time: formatDateTimeShort(detail.lastSyncedAt, locale),
                  })}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* 今すぐ更新（FEAT-005） */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing || isRateLimited}
                className="inline-flex items-center justify-center rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.05] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/[.06]"
              >
                {isRefreshing ? t("refreshingButton") : t("refreshButton")}
              </button>
              {isRateLimited && retryAfterSec !== null ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t("rateLimitedMessage", { seconds: retryAfterSec })}
                </p>
              ) : null}
            </div>
            {refreshError && refreshError.code !== "REAUTH_REQUIRED" ? (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {refreshError.message}
              </div>
            ) : null}
            {refreshedMessageText ? (
              <div
                role="status"
                className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              >
                {refreshedMessageText}
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => void handleSave(e)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-name`} className="text-sm font-medium">
                {t("nameLabel")}
              </label>
              <input
                id={`${formId}-name`}
                type="text"
                required
                value={name}
                onChange={(event) =>
                  dispatch({ type: "SET_NAME", payload: event.target.value })
                }
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${formId}-range`}
                className="text-sm font-medium"
              >
                {t("rangeLabel")}
              </label>
              <input
                id={`${formId}-range`}
                type="text"
                required
                value={range}
                onChange={(event) =>
                  dispatch({ type: "SET_RANGE", payload: event.target.value })
                }
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
              <p className="text-xs text-black/50 dark:text-white/50">
                {t("rangeHelp")}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${formId}-refresh`}
                className="text-sm font-medium"
              >
                {t("refreshIntervalLabel")}
              </label>
              <select
                id={`${formId}-refresh`}
                value={refreshIntervalSec}
                onChange={(event) =>
                  dispatch({
                    type: "SET_REFRESH_INTERVAL",
                    payload: Number(event.target.value),
                  })
                }
                className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-900 dark:text-white dark:focus:border-white/50"
              >
                {REFRESH_INTERVAL_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} 秒
                  </option>
                ))}
              </select>
            </div>

            {detail.preview.columns.length > 0 ? (
              <ColumnTypeOverrideEditor
                columns={detail.preview.columns}
                overrides={overrides as Partial<Record<string, ColumnDataType>>}
                onChange={(columnName, type) =>
                  dispatch({
                    type: "SET_OVERRIDE",
                    payload: { columnName, dataType: type },
                  })
                }
                messages={{
                  heading: tColumnTypes("heading"),
                  description: tColumnTypes("description"),
                  columnNameHeading: tColumnTypes("columnNameHeading"),
                  estimatedTypeHeading: tColumnTypes("estimatedTypeHeading"),
                  overrideTypeHeading: tColumnTypes("overrideTypeHeading"),
                  estimatedBadge: tColumnTypes("estimatedBadge"),
                  overriddenBadge: tColumnTypes("overriddenBadge"),
                  typeLabels,
                  useEstimatedOption: tColumnTypes("useEstimatedOption"),
                }}
              />
            ) : null}

            {saveError ? (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {saveError.message}
              </div>
            ) : null}

            {didSave && savedMessageText ? (
              <div
                role="status"
                className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              >
                {savedMessageText}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saveStatus === "saving" || name.trim().length === 0}
              className="inline-flex items-center justify-center self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {saveStatus === "saving" ? t("savingButton") : t("saveButton")}
            </button>
          </form>

          <DataSourcePreviewTable
            preview={detail.preview}
            messages={{
              heading: tPreview("heading"),
              columnsHeading: tPreview("columnsHeading"),
              rowsHeading: (count) => tPreview("rowsHeading", { count }),
              totalRowCount: (count) => tPreview("totalRowCount", { count }),
              truncatedNote: (count) => tPreview("truncatedNote", { count }),
              typeLabels,
              emptyRows: tPreview("emptyRows"),
            }}
          />

          <div className="flex flex-col gap-3 border-t border-black/10 pt-4 dark:border-white/15">
            <h4 className="text-sm font-medium text-red-700 dark:text-red-300">
              {t("dangerZoneHeading")}
            </h4>

            {blockedUsage ? (
              <div
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
              >
                {t("inUseMessage", {
                  widgetCount: blockedUsage.widgetCount,
                  dashboardCount: blockedUsage.dashboardCount,
                })}
              </div>
            ) : null}

            {deleteError ? (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {deleteError.message}
              </div>
            ) : null}

            {detail.usage.widgetCount > 0 ? (
              <p className="text-sm text-black/60 dark:text-white/60">
                {t("inUseHint", {
                  widgetCount: detail.usage.widgetCount,
                  dashboardCount: detail.usage.dashboardCount,
                })}
              </p>
            ) : confirmingDelete ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-black/70 dark:text-white/70">
                  {t("confirmDeleteMessage")}
                </p>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleteStatus === "deleting"}
                  className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteStatus === "deleting"
                    ? t("deletingButton")
                    : t("confirmDeleteButton")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "CONFIRM_DELETE", payload: false })
                  }
                  className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
                >
                  {t("cancelButton")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "CONFIRM_DELETE", payload: true })
                }
                className="inline-flex items-center justify-center self-start rounded-full border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                {t("deleteButton")}
              </button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

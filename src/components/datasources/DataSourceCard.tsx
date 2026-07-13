import { useTranslations } from "next-intl";

import type {
  AuthMode,
  DataSourceUsage,
  SyncStatus,
} from "@/lib/sheets/schema";

export type DataSourceCardItem = {
  id: string;
  name: string;
  spreadsheetId: string;
  range: string;
  authMode: AuthMode;
  refreshIntervalSec: number;
  usage: DataSourceUsage;
  syncStatus: SyncStatus;
  updatedAt: Date;
  /** ロケール対応済みの表示用日時文字列（親コンポーネントで formatDateTimeShort を適用済み） */
  updatedAtFormatted: string;
};

export type DataSourceCardMessages = {
  spreadsheetIdLabel: string;
  rangeLabel: string;
  authModeLabel: string;
  refreshIntervalLabel: string;
  updatedAtLabel: string;
  authModeLabels: Record<AuthMode, string>;
  usageLabel: string;
  usageNone: string;
  editButton: string;
  closeButton: string;
  reauthRequiredBadge: string;
};

type DataSourceCardProps = {
  dataSource: DataSourceCardItem;
  messages: DataSourceCardMessages;
  isSelected: boolean;
  onEdit: (id: string) => void;
};

/**
 * 登録済みデータソース1件分の表示専用カード。
 *
 * - 名称・接続元シート・更新間隔・利用状況（FEAT-003「名称・接続元シート・更新間隔・状態を
 *   確認できる」）を表示し、編集パネルを開くトリガーを提供する。
 * - 状態管理（選択中 ID・編集パネルの開閉・API 呼び出し）は親（`DataSourceList`）に置き、
 *   ここでは表示と「編集を開く」イベントの発火のみを担当する
 *   （.claude/rules/architecture.md: 「データ取得・状態管理」と「表示」を分離する）。
 * - 削除操作自体は編集パネル側に集約する（誤操作防止のため、確認導線を一箇所にまとめる）。
 */
export function DataSourceCard({
  dataSource,
  messages,
  isSelected,
  onEdit,
}: DataSourceCardProps) {
  const t = useTranslations("datasources.list");
  const { usage } = dataSource;
  const isInUse = usage.widgetCount > 0;

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
        isSelected
          ? "border-black/40 dark:border-white/50"
          : "border-black/10 dark:border-white/15"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{dataSource.name}</h3>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {dataSource.syncStatus === "REAUTH_REQUIRED" ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {messages.reauthRequiredBadge}
            </span>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isInUse
                ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "bg-black/[.06] text-black/60 dark:bg-white/[.08] dark:text-white/60"
            }`}
          >
            {isInUse
              ? t("usageValue", {
                  widgetCount: usage.widgetCount,
                  dashboardCount: usage.dashboardCount,
                })
              : messages.usageNone}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-black/70 sm:grid-cols-2 dark:text-white/70">
        <div className="flex gap-2">
          <dt className="text-black/50 dark:text-white/60">
            {messages.spreadsheetIdLabel}
          </dt>
          <dd className="truncate font-mono text-xs">
            {dataSource.spreadsheetId}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-black/50 dark:text-white/60">
            {messages.rangeLabel}
          </dt>
          <dd className="font-mono text-xs">{dataSource.range}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-black/50 dark:text-white/60">
            {messages.authModeLabel}
          </dt>
          <dd>{messages.authModeLabels[dataSource.authMode]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-black/50 dark:text-white/60">
            {messages.refreshIntervalLabel}
          </dt>
          <dd>
            {t("refreshIntervalValue", {
              seconds: dataSource.refreshIntervalSec,
            })}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-black/50 dark:text-white/60">
            {messages.updatedAtLabel}
          </dt>
          <dd>{dataSource.updatedAtFormatted}</dd>
        </div>
      </dl>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onEdit(dataSource.id)}
          aria-pressed={isSelected}
          className="inline-flex items-center justify-center rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/20 dark:hover:bg-white/[.06]"
        >
          {isSelected ? messages.closeButton : messages.editButton}
        </button>
      </div>
    </li>
  );
}

"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { CreateDashboardDialog } from "@/components/dashboard/CreateDashboardDialog";
import type { CreateDashboardState } from "@/lib/dashboards/actions";
import { formatDateTimeShort } from "@/i18n/localeUtils";
import type { AppLocale } from "@/i18n/locales";

type Dashboard = {
  id: string;
  title: string;
  description: string | null;
  widgetCount: number;
  updatedAt: Date;
};

type Props = {
  dashboards: Dashboard[];
  createAction: (
    prevState: CreateDashboardState,
    formData: FormData,
  ) => Promise<CreateDashboardState>;
  labels: {
    createButton: string;
    editButton: string;
    cloneButton: string;
    deleteButton: string;
    confirmDeleteMessage: string;
    confirmDeleteButton: string;
    cancelButton: string;
    cloneSuccessMessage: string;
    deleteSuccessMessage: string;
    emptyTitle: string;
    emptyDescription: string;
    createDialog: {
      title: string;
      titleLabel: string;
      titlePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      submitButton: string;
      submittingButton: string;
      cancelButton: string;
    };
  };
  cloneAction: (dashboardId: string) => Promise<void>;
  deleteAction: (dashboardId: string) => Promise<void>;
};

/**
 * ダッシュボード一覧のインタラクション部分（Client Component）。
 *
 * - 新規作成ダイアログの開閉状態を管理する。
 * - 各カードの複製・削除アクションを処理する。
 * - データ取得・所有権チェックは Server Component 側で完結しており、
 *   このコンポーネントは表示・インタラクションのみを担う（architecture.md 設計分離方針）。
 */
export function DashboardListClient({
  dashboards,
  createAction,
  labels,
  cloneAction,
  deleteAction,
}: Props) {
  const tCard = useTranslations("widgetCard");
  const tDashboard = useTranslations("dashboards");
  const locale = useLocale() as AppLocale;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingCloneId, setPendingCloneId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function handleClone(dashboardId: string) {
    setPendingCloneId(dashboardId);
    try {
      await cloneAction(dashboardId);
    } finally {
      setPendingCloneId(null);
    }
  }

  async function handleDeleteConfirm(dashboardId: string) {
    setPendingDeleteId(dashboardId);
    try {
      await deleteAction(dashboardId);
    } finally {
      setPendingDeleteId(null);
      setDeletingId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        {labels.createButton}
      </button>

      <CreateDashboardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        createAction={createAction}
        labels={labels.createDialog}
      />

      {dashboards.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-black/15 p-12 text-center dark:border-white/20">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium">{labels.emptyTitle}</h2>
            <p className="text-sm text-black/60 dark:text-white/60">
              {labels.emptyDescription}
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <li
              key={dashboard.id}
              className={`flex flex-col gap-3 rounded-xl border border-black/10 p-5 shadow-sm transition-colors dark:border-white/15${deletingId === dashboard.id ? "" : " hover:border-black/20 dark:hover:border-white/25"}`}
            >
              <div className="flex flex-col gap-1">
                <h2 className="font-medium">{dashboard.title}</h2>
                {dashboard.description ? (
                  <p className="text-sm text-black/60 dark:text-white/60">
                    {dashboard.description}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 text-xs text-black/40 dark:text-white/60">
                <span>
                  {tDashboard("widgetCountLabel", {
                    count: dashboard.widgetCount,
                  })}
                </span>
                <span>·</span>
                <span>
                  {tDashboard("updatedAtLabel", {
                    time: formatDateTimeShort(dashboard.updatedAt, locale),
                  })}
                </span>
              </div>

              {deletingId === dashboard.id ? (
                <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {labels.confirmDeleteMessage}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pendingDeleteId === dashboard.id}
                      onClick={() => handleDeleteConfirm(dashboard.id)}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                    >
                      {pendingDeleteId === dashboard.id
                        ? tCard("deletingLabel")
                        : labels.confirmDeleteButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(null)}
                      className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15"
                    >
                      {labels.cancelButton}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <a
                    href={`/dashboards/${dashboard.id}`}
                    className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
                  >
                    {labels.editButton}
                  </a>
                  <button
                    type="button"
                    disabled={pendingCloneId === dashboard.id}
                    onClick={() => handleClone(dashboard.id)}
                    className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.05] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.06]"
                  >
                    {pendingCloneId === dashboard.id
                      ? tCard("cloningLabel")
                      : labels.cloneButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(dashboard.id)}
                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {labels.deleteButton}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

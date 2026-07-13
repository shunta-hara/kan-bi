"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { DeleteAccountState } from "@/lib/account/actions";

type Props = {
  deleteAction: (
    prev: DeleteAccountState,
    formData: FormData,
  ) => Promise<DeleteAccountState>;
  summary: {
    dashboardCount: number;
    dataSourceCount: number;
    widgetCount: number;
  };
  labels: {
    heading: string;
    warningTitle: string;
    warningBody: string;
    summaryHeading: string;
    confirmCheckboxLabel: string;
    irrevocableNote: string;
    submitButton: string;
    submittingButton: string;
  };
};

const initialState: DeleteAccountState = { status: "idle" };

/**
 * アカウント削除フォーム（FEAT-015）。
 *
 * - 削除される内容のサマリーを表示する
 * - 「削除は取り消せない」ことを明示する
 * - チェックボックスによる明示的な確認ステップ
 */
export function DeleteAccountForm({
  deleteAction,
  summary,
  labels,
}: Props): React.JSX.Element {
  const t = useTranslations("settings.deleteAccount");
  const [state, formAction, isPending] = useActionState(
    deleteAction,
    initialState,
  );
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30"
    >
      <h2
        id="delete-account-heading"
        className="text-lg font-semibold text-red-700 dark:text-red-400"
      >
        {labels.heading}
      </h2>

      {/* 警告 */}
      <div className="mt-3 rounded-md border border-red-300 bg-red-100 px-4 py-3 dark:border-red-800 dark:bg-red-900/40">
        <p className="font-medium text-red-800 dark:text-red-300">
          {labels.warningTitle}
        </p>
        <p className="mt-1 text-sm text-red-700 dark:text-red-400">
          {labels.warningBody}
        </p>
      </div>

      {/* 削除対象サマリー */}
      <div className="mt-4">
        <p className="text-sm font-medium text-black/70 dark:text-white/70">
          {labels.summaryHeading}
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-black/60 dark:text-white/60">
          <li>{t("summaryDashboards", { count: summary.dashboardCount })}</li>
          <li>{t("summaryDataSources", { count: summary.dataSourceCount })}</li>
          <li>{t("summaryWidgets", { count: summary.widgetCount })}</li>
        </ul>
      </div>

      {/* エラーメッセージ */}
      {state.status === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-100 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300"
        >
          {state.message}
        </p>
      )}

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="confirmed" value={confirmed ? "true" : ""} />

        {/* 確認チェックボックス */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-red-300 accent-red-600"
            aria-describedby="irrevocable-note"
          />
          <span className="text-sm text-black/80 dark:text-white/80">
            {labels.confirmCheckboxLabel}
          </span>
        </label>
        <p
          id="irrevocable-note"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {labels.irrevocableNote}
        </p>

        {/* 削除ボタン */}
        <button
          type="submit"
          disabled={isPending || !confirmed}
          className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? labels.submittingButton : labels.submitButton}
        </button>
      </form>
    </section>
  );
}

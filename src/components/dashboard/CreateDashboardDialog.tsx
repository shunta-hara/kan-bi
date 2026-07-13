"use client";

import { useActionState } from "react";

import type { CreateDashboardState } from "@/lib/dashboards/actions";

type Props = {
  open: boolean;
  onClose: () => void;
  createAction: (
    prevState: CreateDashboardState,
    formData: FormData,
  ) => Promise<CreateDashboardState>;
  labels: {
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

/**
 * ダッシュボード新規作成ダイアログ（FEAT-007）。
 *
 * - Server Action を受け取ることで、テスト時にモックしやすくする。
 * - 送信中は送信ボタンを無効化してローディング表示を出す。
 * - Server Action 内の `redirect()` によってダッシュボード編集画面へ遷移する。
 */
export function CreateDashboardDialog({
  open,
  onClose,
  createAction,
  labels,
}: Props) {
  const [state, dispatch, isPending] = useActionState<
    CreateDashboardState,
    FormData
  >(createAction, { status: "idle" });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-0 shadow-lg dark:border-white/15 dark:bg-neutral-900 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-6 p-6">
          <h2 className="text-lg font-semibold">{labels.title}</h2>

          <form action={dispatch} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dashboard-title" className="text-sm font-medium">
                {labels.titleLabel}
              </label>
              <input
                id="dashboard-title"
                name="title"
                type="text"
                required
                placeholder={labels.titlePlaceholder}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:placeholder:text-white/35 dark:focus:ring-white/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dashboard-description"
                className="text-sm font-medium"
              >
                {labels.descriptionLabel}
              </label>
              <textarea
                id="dashboard-description"
                name="description"
                rows={3}
                placeholder={labels.descriptionPlaceholder}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-neutral-800 dark:placeholder:text-white/35 dark:focus:ring-white/20"
              />
            </div>

            {state.status === "error" ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
              >
                {labels.cancelButton}
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {isPending ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {labels.submittingButton}
                  </>
                ) : (
                  labels.submitButton
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

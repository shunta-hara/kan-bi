import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  createDashboardAction,
  cloneDashboardAction,
  deleteDashboardAction,
} from "@/lib/dashboards/actions";
import { DashboardListClient } from "@/components/dashboard/DashboardListClient";

/**
 * ダッシュボード一覧画面（FEAT-007）。
 *
 * - 自分（`session.user.id`）が所有するダッシュボードのみを取得する（owner スコープ）。
 * - 新規作成・複製・削除は Server Actions 経由で処理する。
 * - データ取得・所有権チェックはこの Server Component 内で完結し、
 *   クライアントコンポーネントには表示用データのみ渡す（architecture.md 設計分離方針）。
 */
export default async function DashboardsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const t = await getTranslations("dashboards");

  const dashboards = await prisma.dashboard.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      updatedAt: true,
      _count: { select: { widgets: true } },
    },
  });

  const dashboardItems = dashboards.map(({ _count, ...rest }) => ({
    ...rest,
    widgetCount: _count.widgets,
  }));

  // Server Actions をバインドして Client Component に渡す
  async function cloneAction(dashboardId: string) {
    "use server";
    const formData = new FormData();
    formData.set("dashboardId", dashboardId);
    await cloneDashboardAction({ status: "idle" }, formData);
  }

  async function deleteAction(dashboardId: string) {
    "use server";
    const formData = new FormData();
    formData.set("dashboardId", dashboardId);
    await deleteDashboardAction({ status: "idle" }, formData);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {t("countLabel", { count: dashboardItems.length })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/datasources"
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            {t("dataSourcesLink")}
          </Link>

          <Link
            href="/settings"
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            {t("settingsLink")}
          </Link>

          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/lib/auth/auth");
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
            >
              {t("signOutButton")}
            </button>
          </form>
        </div>
      </header>

      <DashboardListClient
        dashboards={dashboardItems}
        createAction={createDashboardAction}
        cloneAction={cloneAction}
        deleteAction={deleteAction}
        labels={{
          createButton: t("createButton"),
          editButton: t("editButton"),
          cloneButton: t("cloneButton"),
          deleteButton: t("deleteButton"),
          confirmDeleteMessage: t("confirmDeleteMessage"),
          confirmDeleteButton: t("confirmDeleteButton"),
          cancelButton: t("cancelButton"),
          cloneSuccessMessage: t("cloneSuccessMessage"),
          deleteSuccessMessage: t("deleteSuccessMessage"),
          emptyTitle: t("emptyTitle"),
          emptyDescription: t("emptyDescription"),
          createDialog: {
            title: t("createDialog.title"),
            titleLabel: t("createDialog.titleLabel"),
            titlePlaceholder: t("createDialog.titlePlaceholder"),
            descriptionLabel: t("createDialog.descriptionLabel"),
            descriptionPlaceholder: t("createDialog.descriptionPlaceholder"),
            submitButton: t("createDialog.submitButton"),
            submittingButton: t("createDialog.submittingButton"),
            cancelButton: t("createDialog.cancelButton"),
          },
        }}
      />
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { deleteAccountAction } from "@/lib/account/actions";
import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";

/**
 * アカウント設定画面（FEAT-015）。
 *
 * - 自分のアカウントを削除できる
 * - 削除前に削除される内容（ダッシュボード数・データソース数・ウィジェット数）を表示する
 * - 「削除は取り消せない」ことを明示する
 * - チェックボックスによる確認ステップを経てから削除を実行する
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const t = await getTranslations("settings");

  // 削除前に表示するサマリーデータを取得
  const [dashboardCount, dataSourceCount, widgetCount] = await Promise.all([
    prisma.dashboard.count({ where: { ownerId: session.user.id } }),
    prisma.dataSource.count({ where: { ownerId: session.user.id } }),
    prisma.widget.count({
      where: {
        dashboard: { ownerId: session.user.id },
      },
    }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboards"
          className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
        >
          {t("backToDashboards")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </header>

      {/* アカウント情報 */}
      <section aria-labelledby="account-info-heading" className="space-y-2">
        <h2
          id="account-info-heading"
          className="text-base font-semibold text-black/80 dark:text-white/80"
        >
          {t("accountInfoHeading")}
        </h2>
        <dl className="rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/10">
          <div className="flex gap-4 py-1">
            <dt className="w-24 flex-shrink-0 text-black/50 dark:text-white/50">
              {t("emailLabel")}
            </dt>
            <dd className="text-black/80 dark:text-white/80">
              {session.user.email ?? "—"}
            </dd>
          </div>
          <div className="flex gap-4 py-1">
            <dt className="w-24 flex-shrink-0 text-black/50 dark:text-white/50">
              {t("nameLabel")}
            </dt>
            <dd className="text-black/80 dark:text-white/80">
              {session.user.name ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* アカウント削除 */}
      <DeleteAccountForm
        deleteAction={deleteAccountAction}
        summary={{ dashboardCount, dataSourceCount, widgetCount }}
        labels={{
          heading: t("deleteAccount.heading"),
          warningTitle: t("deleteAccount.warningTitle"),
          warningBody: t("deleteAccount.warningBody"),
          summaryHeading: t("deleteAccount.summaryHeading"),
          confirmCheckboxLabel: t("deleteAccount.confirmCheckboxLabel"),
          irrevocableNote: t("deleteAccount.irrevocableNote"),
          submitButton: t("deleteAccount.submitButton"),
          submittingButton: t("deleteAccount.submittingButton"),
        }}
      />
    </main>
  );
}

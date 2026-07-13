import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { DataSourceList } from "@/components/datasources/DataSourceList";
import { RegisterDataSourceForm } from "@/components/datasources/RegisterDataSourceForm";

/**
 * データソース管理画面（FEAT-002 / FEAT-003 / FEAT-004）。
 *
 * - 自分（`session.user.id`）が所有するデータソースのみを取得・表示する（owner スコープ）。
 * - 左に登録済み一覧（編集・列型上書き・削除を含む）、右に登録フォーム（プレビュー → 登録）を
 *   配置する（仕様書 §10 画面構成「データソース管理（登録・プレビュー・列型上書き・再取得）」）。
 * - 一覧・編集・削除・列型オーバーライドの実体（API 呼び出し・状態管理）は
 *   `DataSourceList` → `EditDataSourcePanel` に委譲する
 *   （.claude/rules/architecture.md: ページは「データ取得」、編集 UI は子コンポーネントへ）。
 */
export default async function DataSourcesPage() {
  const session = await auth();

  // middleware が未ログインを `/login` へ誘導するが、念のため Server Component 側でも防御する
  // （所有権・認可は Route Handler / Server Action / ページの責務であり、middleware には委ねない）。
  if (!session?.user?.id) {
    redirect("/login");
  }

  const t = await getTranslations("datasources");
  const tList = await getTranslations("datasources.list");

  const rawDataSources = await prisma.dataSource.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      spreadsheetId: true,
      range: true,
      authMode: true,
      refreshIntervalSec: true,
      syncStatus: true,
      updatedAt: true,
      widgets: { select: { id: true, dashboardId: true } },
    },
  });

  // 「複数のダッシュボードのウィジェットから利用できる」「使用中は削除できない」(FEAT-003) を
  // 一覧上でも確認できるよう、利用状況を併せて算出する。
  const dataSources = rawDataSources.map(({ widgets, ...rest }) => ({
    ...rest,
    usage: {
      widgetCount: widgets.length,
      dashboardCount: new Set(widgets.map((widget) => widget.dashboardId)).size,
    },
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboards"
          className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
        >
          {t("backToDashboards")}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-black/60 dark:text-white/60">
              {t("countLabel", { count: dataSources.length })}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-label={t("title")}>
          <DataSourceList
            dataSources={dataSources}
            messages={{
              emptyTitle: tList("emptyTitle"),
              emptyDescription: tList("emptyDescription"),
              spreadsheetIdLabel: tList("spreadsheetIdLabel"),
              rangeLabel: tList("rangeLabel"),
              authModeLabel: tList("authModeLabel"),
              refreshIntervalLabel: tList("refreshIntervalLabel"),
              updatedAtLabel: tList("updatedAtLabel"),
              authModeLabels: {
                PUBLIC: tList("authModePublic"),
                OAUTH: tList("authModeOauth"),
              },
              usageLabel: tList("usageLabel"),
              usageNone: tList("usageNone"),
              editButton: tList("editButton"),
              closeButton: tList("closeButton"),
              reauthRequiredBadge: tList("reauthRequiredBadge"),
            }}
          />
        </section>

        <section aria-label={t("title")}>
          <RegisterDataSourceForm />
        </section>
      </div>
    </main>
  );
}

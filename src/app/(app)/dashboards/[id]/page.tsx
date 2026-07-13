import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  parseWidgetConfig,
  parseWidgetQuery,
  parseDashboardLayouts,
  widgetChartTypeSchema,
} from "@/lib/dashboards/schema";
import type { WidgetDataStatus } from "@/lib/dashboards/schema";
import {
  addWidgetAction,
  deleteWidgetAction,
  updateWidgetAction,
} from "@/lib/dashboards/widgetActions";
import { DashboardDetailClient } from "@/components/dashboard/DashboardDetailClient";
import { PdfDownloadButton } from "@/components/dashboard/PdfDownloadButton";
import { fetchAndNormalizeSheetTable } from "@/lib/sheets/fetchSheetTable";
import { parseColumnTypeOverrides } from "@/lib/sheets/schema";
import { toSheetFetchError } from "@/lib/sheets/errors";
import { applyQuery, tableToRows } from "@/lib/query/applyQuery";
import type { QueryResult } from "@/lib/query/applyQuery";
import { logWidgetFetchError } from "@/lib/observability/logger";

/**
 * ダッシュボード詳細・編集画面（FEAT-007 / FEAT-008 / FEAT-009 / FEAT-011）。
 *
 * - 所有権チェック: `session.user.id` と `dashboard.ownerId` が一致するか確認する。
 *   不一致・未存在は `notFound()` で 404 を返す（存在を漏らさない）。
 * - ウィジェット追加・削除は Server Actions 経由で処理する。
 * - 各ウィジェットのデータソースからシートデータを取得し applyQuery で集計済み
 *   QueryResult を生成してクライアントに渡す（FEAT-009 / Sprint 6）。
 * - Dashboard.layouts（Json）を parseDashboardLayouts でパースして DashboardGrid に渡す（Sprint 7）。
 */
type PageProps = { params: Promise<{ id: string }> };

export default async function DashboardDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      title: true,
      description: true,
      layouts: true,
    },
  });

  // 存在しない or 他人のダッシュボードは 404
  if (!dashboard || dashboard.ownerId !== session.user.id) {
    notFound();
  }

  const initialLayouts = parseDashboardLayouts(dashboard.layouts);

  const dashboardWidgets = await prisma.widget.findMany({
    where: { dashboardId: id },
    select: {
      id: true,
      dashboardId: true,
      dataSourceId: true,
      type: true,
      title: true,
      query: true,
      config: true,
    },
  });

  // ユーザーが所有するデータソース一覧（ウィジェット追加ダイアログの選択肢）
  const dataSources = await prisma.dataSource.findMany({
    where: { ownerId: session.user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // ウィジェットが参照するデータソースを一括取得（重複排除）
  const dataSourceIds = [
    ...new Set(
      dashboardWidgets
        .map((w) => w.dataSourceId)
        .filter((dsId): dsId is string => dsId !== null),
    ),
  ];
  const dataSourceMap = new Map<
    string,
    {
      spreadsheetId: string;
      range: string;
      authMode: string;
      columnTypes: unknown;
    }
  >();
  if (dataSourceIds.length > 0) {
    const dsList = await prisma.dataSource.findMany({
      where: {
        id: { in: dataSourceIds },
        ownerId: session.user.id,
      },
      select: {
        id: true,
        spreadsheetId: true,
        range: true,
        authMode: true,
        columnTypes: true,
      },
    });
    for (const ds of dsList) {
      dataSourceMap.set(ds.id, ds);
    }
  }

  // Widget.type は DB では string として保存されているが、
  // WidgetSummary.type は WidgetChartType（union）を期待するため Zod で安全にパースする。
  // 未知の type 値は "bar" にフォールバックする（parseWidgetConfig と同じ方針）。
  // 各ウィジェットに対してシートデータを取得し applyQuery を実行する。
  // データソース未設定・取得失敗時は dataStatus でエラー種別を区別してクライアントに渡す（FEAT-BF-003）。
  const widgets = await Promise.all(
    dashboardWidgets.map(async (widget) => {
      const parsedType = widgetChartTypeSchema.safeParse(widget.type);
      const query = parseWidgetQuery(widget.query);
      const config = parseWidgetConfig(widget.config);

      let queryResult: QueryResult | null = null;
      let dataStatus: WidgetDataStatus = { status: "no_datasource" };

      if (widget.dataSourceId) {
        const ds = dataSourceMap.get(widget.dataSourceId);
        if (ds) {
          try {
            const table = await fetchAndNormalizeSheetTable({
              userId: session.user.id,
              spreadsheetId: ds.spreadsheetId,
              range: ds.range,
              authMode: ds.authMode as "OAUTH" | "PUBLIC",
              columnTypeOverrides: parseColumnTypeOverrides(ds.columnTypes),
            });
            const rows = tableToRows({
              columns: table.columns,
              rows: table.rows,
            });
            queryResult = applyQuery(rows, query);
            dataStatus = { status: "ok" };
          } catch (error) {
            // 取得失敗（権限切れ・ネットワーク等）を構造化ログ・Sentry に記録し、
            // エラー種別をクライアントに渡す（FEAT-BF-003 / FEAT-BF-007）。
            const sfError = toSheetFetchError(error);
            logWidgetFetchError({
              widgetId: widget.id,
              dataSourceId: widget.dataSourceId,
              errorCode: sfError.code,
              errorMessage: sfError.message,
            });
            dataStatus = { status: "error", code: sfError.code };
          }
        } else {
          // dataSourceMap に存在しない = ユーザーが所有していないか既に削除されたデータソース
          dataStatus = { status: "error", code: "NOT_FOUND" };
        }
      }

      return {
        id: widget.id,
        dashboardId: widget.dashboardId,
        dataSourceId: widget.dataSourceId,
        type: parsedType.success ? parsedType.data : ("bar" as const),
        title: widget.title,
        query,
        config,
        queryResult,
        dataStatus,
      };
    }),
  );

  const t = await getTranslations("dashboardDetail");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboards"
            className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
          >
            {t("backButton")}
          </Link>
          <div>
            <h1 className="text-xl font-semibold">{dashboard.title}</h1>
            {dashboard.description ? (
              <p className="text-sm text-black/60 dark:text-white/60">
                {dashboard.description}
              </p>
            ) : null}
          </div>
        </div>
        {/* PDF 出力ボタン（FEAT-013 / Sprint 8）
            widgetCount を渡してウィジェット 0 件の警告を表示（FEAT-BF-008） */}
        <PdfDownloadButton
          dashboardId={dashboard.id}
          widgetCount={widgets.length}
          labels={{
            button: t("pdfButton.button"),
            downloading: t("pdfButton.downloading"),
            paperSizeLabel: t("pdfButton.paperSizeLabel"),
            orientationLabel: t("pdfButton.orientationLabel"),
            paperSizeA4: t("pdfButton.paperSizeA4"),
            paperSizeA3: t("pdfButton.paperSizeA3"),
            orientationPortrait: t("pdfButton.orientationPortrait"),
            orientationLandscape: t("pdfButton.orientationLandscape"),
            downloadButton: t("pdfButton.downloadButton"),
            cancelButton: t("pdfButton.cancelButton"),
            errorMessage: t("pdfButton.errorMessage"),
            noWidgetsWarning: t("pdfButton.noWidgetsWarning"),
          }}
        />
      </header>

      <DashboardDetailClient
        dashboardId={dashboard.id}
        initialLayouts={initialLayouts}
        widgets={widgets}
        dataSources={dataSources}
        addWidgetAction={addWidgetAction}
        deleteWidgetAction={deleteWidgetAction}
        updateWidgetAction={updateWidgetAction}
        labels={{
          addWidgetButton: t("addWidgetButton"),
          editModeButton: t("editModeButton"),
          viewModeButton: t("viewModeButton"),
          layoutSaveError: t("layoutSaveError"),
          noWidgets: t("noWidgets"),
          noWidgetsDescription: t("noWidgetsDescription"),
          widgetDialog: {
            title: t("widgetDialog.title"),
            chartTypeLabel: t("widgetDialog.chartTypeLabel"),
            titleLabel: t("widgetDialog.titleLabel"),
            titlePlaceholder: t("widgetDialog.titlePlaceholder"),
            dataSourceLabel: t("widgetDialog.dataSourceLabel"),
            dataSourceNone: t("widgetDialog.dataSourceNone"),
            submitButton: t("widgetDialog.submitButton"),
            submittingButton: t("widgetDialog.submittingButton"),
            cancelButton: t("widgetDialog.cancelButton"),
            chartTypes: {
              bar: t("widgetDialog.chartTypes.bar"),
              line: t("widgetDialog.chartTypes.line"),
              area: t("widgetDialog.chartTypes.area"),
              pie: t("widgetDialog.chartTypes.pie"),
              donut: t("widgetDialog.chartTypes.donut"),
              scatter: t("widgetDialog.chartTypes.scatter"),
              bubble: t("widgetDialog.chartTypes.bubble"),
              radar: t("widgetDialog.chartTypes.radar"),
              heatmap: t("widgetDialog.chartTypes.heatmap"),
              gauge: t("widgetDialog.chartTypes.gauge"),
              treemap: t("widgetDialog.chartTypes.treemap"),
              funnel: t("widgetDialog.chartTypes.funnel"),
              kpi: t("widgetDialog.chartTypes.kpi"),
              table: t("widgetDialog.chartTypes.table"),
            },
          },
          widgetEditDialog: {
            title: t("widgetEditDialog.title"),
            dataSourceLabel: t("widgetEditDialog.dataSourceLabel"),
            dataSourceNone: t("widgetEditDialog.dataSourceNone"),
            chartTypeLabel: t("widgetEditDialog.chartTypeLabel"),
            groupByColumnLabel: t("widgetEditDialog.groupByColumnLabel"),
            groupByColumnPlaceholder: t(
              "widgetEditDialog.groupByColumnPlaceholder",
            ),
            measuresLabel: t("widgetEditDialog.measuresLabel"),
            measureColumnPlaceholder: t(
              "widgetEditDialog.measureColumnPlaceholder",
            ),
            measureFunctionLabel: t("widgetEditDialog.measureFunctionLabel"),
            xAxisColumnLabel: t("widgetEditDialog.xAxisColumnLabel"),
            xAxisColumnPlaceholder: t(
              "widgetEditDialog.xAxisColumnPlaceholder",
            ),
            yAxisColumnLabel: t("widgetEditDialog.yAxisColumnLabel"),
            yAxisColumnPlaceholder: t(
              "widgetEditDialog.yAxisColumnPlaceholder",
            ),
            showLegendLabel: t("widgetEditDialog.showLegendLabel"),
            showLabelsLabel: t("widgetEditDialog.showLabelsLabel"),
            previewHeading: t("widgetEditDialog.previewHeading"),
            saveButton: t("widgetEditDialog.saveButton"),
            savingButton: t("widgetEditDialog.savingButton"),
            cancelButton: t("widgetEditDialog.cancelButton"),
            chartTypes: {
              bar: t("widgetDialog.chartTypes.bar"),
              line: t("widgetDialog.chartTypes.line"),
              area: t("widgetDialog.chartTypes.area"),
              pie: t("widgetDialog.chartTypes.pie"),
              donut: t("widgetDialog.chartTypes.donut"),
              scatter: t("widgetDialog.chartTypes.scatter"),
              bubble: t("widgetDialog.chartTypes.bubble"),
              radar: t("widgetDialog.chartTypes.radar"),
              heatmap: t("widgetDialog.chartTypes.heatmap"),
              gauge: t("widgetDialog.chartTypes.gauge"),
              treemap: t("widgetDialog.chartTypes.treemap"),
              funnel: t("widgetDialog.chartTypes.funnel"),
              kpi: t("widgetDialog.chartTypes.kpi"),
              table: t("widgetDialog.chartTypes.table"),
            },
            aggregateFunctions: {
              count: t("widgetEditDialog.aggregateFunctions.count"),
              sum: t("widgetEditDialog.aggregateFunctions.sum"),
              avg: t("widgetEditDialog.aggregateFunctions.avg"),
              min: t("widgetEditDialog.aggregateFunctions.min"),
              max: t("widgetEditDialog.aggregateFunctions.max"),
            },
          },
          widgetCard: {
            deleteButton: t("widgetCard.deleteButton"),
            editButton: t("widgetCard.editButton"),
            noDataSource: t("widgetCard.noDataSource"),
            confirmDeleteMessage: t("widgetCard.confirmDeleteMessage"),
            confirmDeleteButton: t("widgetCard.confirmDeleteButton"),
            cancelButton: t("widgetCard.cancelButton"),
            dragHandleLabel: t("widgetCard.dragHandleLabel"),
          },
        }}
      />
    </main>
  );
}

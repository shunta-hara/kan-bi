import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { consumePdfToken } from "@/lib/pdf/pdfToken";
import { prisma } from "@/lib/db/prisma";
import {
  parseWidgetConfig,
  parseWidgetQuery,
  widgetChartTypeSchema,
} from "@/lib/dashboards/schema";
import { fetchAndNormalizeSheetTable } from "@/lib/sheets/fetchSheetTable";
import { parseColumnTypeOverrides } from "@/lib/sheets/schema";
import { toSheetFetchError } from "@/lib/sheets/errors";
import { applyQuery, tableToRows } from "@/lib/query/applyQuery";
import type { QueryResult } from "@/lib/query/applyQuery";
import { logWidgetFetchError } from "@/lib/observability/logger";
import { PrintDashboard } from "@/components/dashboard/PrintDashboard";

/**
 * ダッシュボード印刷ページ（FEAT-013）。
 *
 * Playwright がこのページをレンダリングして PDF を生成する。
 * 認証は `X-Pdf-Token` ヘッダーで渡された PDF トークンで行う。
 * - トークン検証後、`consumePdfToken` がトークンを無効化する（単回使用）。
 * - Auth.js のセッション Cookie ではなく専用トークンを使うため、
 *   Playwright はブラウザセッションを持たなくてよい。
 *
 * セキュリティ:
 * - トークン検証失敗（期限切れ・使用済み・束縛不一致）は 404 で返す（存在を漏らさない）。
 * - このページには `noindex` を設定し、検索エンジンにインデックスされないようにする。
 */
type PageProps = { params: Promise<{ id: string }> };

export default async function PrintPage({ params }: PageProps) {
  const { id: dashboardId } = await params;

  // ヘッダーから PDF トークンを取得
  const headersList = await headers();
  const pdfToken = headersList.get("x-pdf-token");

  if (!pdfToken) {
    notFound();
  }

  // トークンを検証・消費（使用済みにする）
  let tokenPayload: { sub: string; dashboardId: string };
  try {
    tokenPayload = await consumePdfToken(pdfToken);
  } catch {
    notFound();
  }

  // トークンの dashboardId とルートパラメータの id が一致することを確認
  if (tokenPayload.dashboardId !== dashboardId) {
    notFound();
  }

  // ダッシュボードを取得（所有権はトークンで確認済み）
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
    select: { id: true, title: true, description: true, ownerId: true },
  });

  if (!dashboard || dashboard.ownerId !== tokenPayload.sub) {
    notFound();
  }

  // ウィジェット取得
  const dashboardWidgets = await prisma.widget.findMany({
    where: { dashboardId },
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

  // データソースを一括取得
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
        ownerId: tokenPayload.sub,
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

  // 各ウィジェットのクエリ結果を取得
  const widgets = await Promise.all(
    dashboardWidgets.map(async (widget) => {
      const parsedType = widgetChartTypeSchema.safeParse(widget.type);
      const query = parseWidgetQuery(widget.query);
      const config = parseWidgetConfig(widget.config);

      let queryResult: QueryResult | null = null;
      if (widget.dataSourceId) {
        const ds = dataSourceMap.get(widget.dataSourceId);
        if (ds) {
          try {
            const table = await fetchAndNormalizeSheetTable({
              userId: tokenPayload.sub,
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
          } catch (error) {
            // 取得失敗を構造化ログ・Sentry に記録する（FEAT-BF-007）。
            // 印刷ページはグラフを空欄で表示してページ生成を継続する。
            const sfError = toSheetFetchError(error);
            logWidgetFetchError({
              widgetId: widget.id,
              dataSourceId: widget.dataSourceId,
              errorCode: sfError.code,
              errorMessage: sfError.message,
            });
            queryResult = null;
          }
        }
      }

      return {
        id: widget.id,
        type: parsedType.success ? parsedType.data : ("bar" as const),
        title: widget.title,
        query,
        config,
        queryResult,
      };
    }),
  );

  const generatedAt = new Date();

  return (
    <>
      {/* 検索エンジンインデックス防止 */}
      <meta name="robots" content="noindex, nofollow" />
      <PrintDashboard
        title={dashboard.title}
        description={dashboard.description}
        widgets={widgets}
        generatedAt={generatedAt}
      />
    </>
  );
}

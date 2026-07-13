import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  parseDashboardLayouts,
  parseWidgetConfig,
  parseWidgetQuery,
  updateWidgetInputSchema,
} from "@/lib/dashboards/schema";

/**
 * `GET/PATCH/DELETE /api/dashboards/:id/widgets/:widgetId`
 *
 * ウィジェットの取得・更新・削除（FEAT-008 / FEAT-012）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック: ダッシュボードが `session.user.id` に属しているか確認（不一致は 404）
 * - 削除時は `Dashboard.layouts` から対応するレイアウト項目もトランザクション内で同時削除する
 *   （spec §FR-4 / architecture.md: 「孤立したレイアウト項目を作らない」）
 */

type RouteContext = { params: Promise<{ id: string; widgetId: string }> };

const UNAUTHENTICATED_RESPONSE = {
  error: { code: "UNAUTHENTICATED", message: "Sign-in is required." },
} as const;

const NOT_FOUND_RESPONSE = {
  error: {
    code: "NOT_FOUND",
    message: "The requested widget was not found.",
  },
} as const;

/**
 * ダッシュボード所有権を確認しつつ、指定ウィジェットを取得する。
 * ダッシュボードが存在しない/他人のもの、またはウィジェットが当該ダッシュボードに属さない
 * 場合は `null` を返す（呼び出し側で 404 にする）。
 */
async function findOwnedWidget(
  dashboardId: string,
  widgetId: string,
  ownerId: string,
) {
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
  });
  if (!dashboard || dashboard.ownerId !== ownerId) return null;

  const widget = await prisma.widget.findUnique({ where: { id: widgetId } });
  if (!widget || widget.dashboardId !== dashboardId) return null;

  return { dashboard, widget };
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id, widgetId } = await context.params;
  const result = await findOwnedWidget(id, widgetId, session.user.id);
  if (!result) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const { widget } = result;
  return NextResponse.json({
    data: {
      id: widget.id,
      dashboardId: widget.dashboardId,
      dataSourceId: widget.dataSourceId,
      type: widget.type,
      title: widget.title,
      query: parseWidgetQuery(widget.query),
      config: parseWidgetConfig(widget.config),
    },
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id, widgetId } = await context.params;
  const result = await findOwnedWidget(id, widgetId, session.user.id);
  if (!result) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BODY",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = updateWidgetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The provided widget details are invalid.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const { dataSourceId, title, query, config } = parsed.data;

  // `dataSourceId` が指定された場合は所有確認（他ユーザーのデータソースは参照不可）
  if (dataSourceId !== undefined && dataSourceId !== null) {
    const ds = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
    });
    if (!ds || ds.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "The specified data source was not found.",
          },
        },
        { status: 404 },
      );
    }
  }

  const updated = await prisma.widget.update({
    where: { id: widgetId },
    data: {
      ...(dataSourceId !== undefined
        ? { dataSourceId: dataSourceId ?? null }
        : {}),
      ...(title !== undefined ? { title: title ?? null } : {}),
      ...(query !== undefined ? { query: query as Prisma.InputJsonValue } : {}),
      ...(config !== undefined
        ? { config: config as Prisma.InputJsonValue }
        : {}),
    },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      dashboardId: updated.dashboardId,
      dataSourceId: updated.dataSourceId,
      type: updated.type,
      title: updated.title,
      query: parseWidgetQuery(updated.query),
      config: parseWidgetConfig(updated.config),
    },
  });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id, widgetId } = await context.params;
  const result = await findOwnedWidget(id, widgetId, session.user.id);
  if (!result) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const { dashboard } = result;

  // トランザクション内でウィジェット削除 + レイアウトの対応項目を同時削除する（§FR-4）。
  // Widget の `onDelete: Cascade` は Dashboard 削除時のものであり、
  // Widget を単体削除した場合にレイアウト項目は自動では消えないため、アプリ層で削除する。
  await prisma.$transaction(async (tx) => {
    await tx.widget.delete({ where: { id: widgetId } });

    const currentLayouts = parseDashboardLayouts(dashboard.layouts);
    const updatedLayouts: Record<string, unknown[]> = {};
    for (const [bp, items] of Object.entries(currentLayouts)) {
      updatedLayouts[bp] = items.filter((item) => item.i !== widgetId);
    }

    await tx.dashboard.update({
      where: { id },
      data: { layouts: updatedLayouts as Prisma.InputJsonValue },
    });
  });

  return new NextResponse(null, { status: 204 });
}

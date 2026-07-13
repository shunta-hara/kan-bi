import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  createWidgetInputSchema,
  parseDashboardLayouts,
  parseWidgetConfig,
  parseWidgetQuery,
} from "@/lib/dashboards/schema";

/**
 * `GET /api/dashboards/:id/widgets` / `POST /api/dashboards/:id/widgets`
 *
 * ウィジェット一覧の取得・追加（FEAT-008）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック: ダッシュボードが `session.user.id` に属しているか確認（不一致は 404）
 * - 追加時は `Dashboard.layouts` にデフォルト位置のレイアウト項目を同時に追加する（§FR-4）
 *   新規ウィジェットは空いている最下部に自動配置する（FEAT-012）
 */

type RouteContext = { params: Promise<{ id: string }> };

const UNAUTHENTICATED_RESPONSE = {
  error: { code: "UNAUTHENTICATED", message: "Sign-in is required." },
} as const;

const NOT_FOUND_RESPONSE = {
  error: {
    code: "NOT_FOUND",
    message: "The requested dashboard was not found.",
  },
} as const;

/** 最下部の y 座標（既存レイアウトアイテムの y + h の最大値）を算出する */
function calcNextY(layouts: ReturnType<typeof parseDashboardLayouts>): number {
  let maxY = 0;
  for (const items of Object.values(layouts)) {
    for (const item of items) {
      const bottom = item.y + item.h;
      if (bottom > maxY) maxY = bottom;
    }
  }
  return maxY;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id } = await context.params;
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard || dashboard.ownerId !== session.user.id) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const widgets = await prisma.widget.findMany({
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

  return NextResponse.json({
    data: widgets.map((widget) => ({
      id: widget.id,
      dashboardId: widget.dashboardId,
      dataSourceId: widget.dataSourceId,
      type: widget.type,
      title: widget.title,
      query: parseWidgetQuery(widget.query),
      config: parseWidgetConfig(widget.config),
    })),
  });
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id } = await context.params;
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard || dashboard.ownerId !== session.user.id) {
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

  const parsed = createWidgetInputSchema.safeParse(body);
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

  const { dataSourceId, type, title, query, config } = parsed.data;

  // `dataSourceId` が指定された場合は所有確認（他ユーザーのデータソースは参照不可）
  if (dataSourceId !== undefined) {
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

  // トランザクション内でウィジェット作成 + レイアウト更新を行う（§FR-4）
  const created = await prisma.$transaction(async (tx) => {
    const widget = await tx.widget.create({
      data: {
        dashboardId: id,
        dataSourceId: dataSourceId ?? null,
        type,
        title: title ?? null,
        query: query as Prisma.InputJsonValue,
        config: config as Prisma.InputJsonValue,
      },
    });

    // 新規ウィジェットをデフォルト位置（最下部・幅6・高さ4）でレイアウトに追加
    const currentLayouts = parseDashboardLayouts(dashboard.layouts);
    const nextY = calcNextY(currentLayouts);
    const defaultItem = { i: widget.id, x: 0, y: nextY, w: 6, h: 4 };

    const updatedLayouts: Record<string, unknown[]> = {};
    // 既存ブレークポイントに追加
    for (const [bp, items] of Object.entries(currentLayouts)) {
      updatedLayouts[bp] = [...items, defaultItem];
    }
    // まだブレークポイントがない場合は "lg" のみ作成
    if (Object.keys(updatedLayouts).length === 0) {
      updatedLayouts["lg"] = [defaultItem];
    }

    await tx.dashboard.update({
      where: { id },
      data: { layouts: updatedLayouts as Prisma.InputJsonValue },
    });

    return widget;
  });

  return NextResponse.json(
    {
      data: {
        id: created.id,
        dashboardId: created.dashboardId,
        dataSourceId: created.dataSourceId,
        type: created.type,
        title: created.title,
        query: parseWidgetQuery(created.query),
        config: parseWidgetConfig(created.config),
      },
    },
    { status: 201 },
  );
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  parseDashboardLayouts,
  parseWidgetConfig,
  parseWidgetQuery,
  updateDashboardInputSchema,
} from "@/lib/dashboards/schema";

/**
 * `GET/PATCH/DELETE /api/dashboards/:id`
 *
 * ダッシュボードの取得・更新・削除（FEAT-007）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック（`ownerId === session.user.id`、不一致は 404）を Route Handler 側で行う
 *   （architecture.md: 「所有権チェックは Route Handler / Server Action 側で必ず行う」）。
 *   存在しない ID と他人の ID を区別しない（リソースの存在を漏らさないため、いずれも 404）。
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

async function findOwnedDashboard(id: string, ownerId: string) {
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard || dashboard.ownerId !== ownerId) return null;
  return dashboard;
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
  const dashboard = await findOwnedDashboard(id, session.user.id);
  if (!dashboard) {
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
    data: {
      id: dashboard.id,
      title: dashboard.title,
      description: dashboard.description,
      ownerId: dashboard.ownerId,
      layouts: parseDashboardLayouts(dashboard.layouts),
      createdAt: dashboard.createdAt,
      updatedAt: dashboard.updatedAt,
    },
    widgets: widgets.map((widget) => ({
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

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id } = await context.params;
  const dashboard = await findOwnedDashboard(id, session.user.id);
  if (!dashboard) {
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

  const parsed = updateDashboardInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The provided dashboard details are invalid.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const { title, description } = parsed.data;

  const updated = await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      // `undefined` は「変更しない」、`null` は明示的に null をセット（説明文を削除）
      ...(description !== undefined
        ? { description: description ?? Prisma.DbNull }
        : {}),
    },
    select: {
      id: true,
      title: true,
      description: true,
      ownerId: true,
      layouts: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    data: {
      ...updated,
      layouts: parseDashboardLayouts(updated.layouts),
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

  const { id } = await context.params;
  const dashboard = await findOwnedDashboard(id, session.user.id);
  if (!dashboard) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  // Widget は `onDelete: Cascade` のため、Dashboard 削除で自動的に削除される。
  await prisma.dashboard.delete({ where: { id: dashboard.id } });

  return new NextResponse(null, { status: 204 });
}

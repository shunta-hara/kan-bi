import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  dashboardLayoutsSchema,
  parseDashboardLayouts,
} from "@/lib/dashboards/schema";

/**
 * `PUT /api/dashboards/:id/layout`
 *
 * ダッシュボードのレイアウト（react-grid-layout の配置情報）を保存する（Sprint 7 / FEAT-011）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック（`ownerId === session.user.id`、不一致は 404）
 * - `layouts` の形式を Zod で検証する（`dashboardLayoutsSchema`）
 * - ウィジェット ID と `layouts.i` の整合性チェックは行わない
 *   （削除時は `widgetActions.ts` のトランザクション内で整理済みのため）
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

export async function PUT(
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

  // `{ layouts: {...} }` の形式を期待する
  const rawLayouts =
    body !== null && typeof body === "object" && "layouts" in body
      ? (body as Record<string, unknown>)["layouts"]
      : body;

  const parsed = dashboardLayoutsSchema.safeParse(rawLayouts);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The provided layout data is invalid.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const updated = await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: { layouts: parsed.data as Prisma.InputJsonValue },
    select: { id: true, layouts: true, updatedAt: true },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      layouts: parseDashboardLayouts(updated.layouts),
      updatedAt: updated.updatedAt,
    },
  });
}

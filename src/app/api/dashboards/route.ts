import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  createDashboardInputSchema,
  parseDashboardLayouts,
} from "@/lib/dashboards/schema";

/**
 * `GET /api/dashboards` / `POST /api/dashboards`
 *
 * ダッシュボード一覧の取得・新規作成（FEAT-007）。
 *
 * - 認証必須（未ログインは 401）
 * - 一覧は所有者（`ownerId === session.user.id`）のものだけを返す（owner スコープ）
 * - 自分以外のダッシュボードは一覧にも表示されない（FEAT-007 受け入れ基準）
 */

const UNAUTHENTICATED_RESPONSE = {
  error: { code: "UNAUTHENTICATED", message: "Sign-in is required." },
} as const;

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const dashboards = await prisma.dashboard.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { widgets: true } },
    },
  });

  const data = dashboards.map(({ _count, ...rest }) => ({
    ...rest,
    widgetCount: _count.widgets,
  }));

  return NextResponse.json({ data });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
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

  const parsed = createDashboardInputSchema.safeParse(body);
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

  const created = await prisma.dashboard.create({
    data: {
      ownerId: session.user.id,
      title,
      description: description ?? null,
      layouts: {},
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

  return NextResponse.json(
    {
      data: {
        ...created,
        layouts: parseDashboardLayouts(created.layouts),
      },
    },
    { status: 201 },
  );
}

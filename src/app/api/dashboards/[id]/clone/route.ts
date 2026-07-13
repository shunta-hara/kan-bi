import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseDashboardLayouts } from "@/lib/dashboards/schema";

/**
 * `POST /api/dashboards/:id/clone`
 *
 * ダッシュボードの複製（FEAT-007）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック必須（他人のダッシュボードは複製できない → 404）
 * - 複製後は元と独立して編集できる（spec: 「複製後は元と独立して編集できる」）
 * - ウィジェットも含めて複製し、レイアウト情報も引き継ぐ
 *   ただし新しいウィジェット ID にレイアウトの `i` を付け替えることで整合性を保つ（§FR-4）
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

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(UNAUTHENTICATED_RESPONSE, { status: 401 });
  }

  const { id } = await context.params;

  // 所有権チェック
  const source = await prisma.dashboard.findUnique({
    where: { id },
    include: { widgets: true },
  });
  if (!source || source.ownerId !== session.user.id) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  // 元のレイアウトをパース
  const sourceLayouts = parseDashboardLayouts(source.layouts);

  // トランザクション内でダッシュボードとウィジェットを複製する。
  // 旧ウィジェット ID → 新ウィジェット ID のマッピングを使ってレイアウトの `i` を付け替える。
  const cloned = await prisma.$transaction(async (tx) => {
    // 複製先ダッシュボードを作成（layouts は後で付け替えるので一旦空）
    const newDashboard = await tx.dashboard.create({
      data: {
        ownerId: session.user.id,
        title: `${source.title} のコピー`,
        description: source.description,
        layouts: {},
      },
    });

    // 各ウィジェットを複製し、旧 ID → 新 ID のマップを構築
    const idMap: Record<string, string> = {};
    for (const widget of source.widgets) {
      const newWidget = await tx.widget.create({
        data: {
          dashboardId: newDashboard.id,
          dataSourceId: widget.dataSourceId,
          type: widget.type,
          title: widget.title,
          query: widget.query ?? {},
          config: widget.config ?? {},
        },
      });
      idMap[widget.id] = newWidget.id;
    }

    // レイアウトの `i` を新しいウィジェット ID に付け替える
    const newLayouts: Record<string, unknown[]> = {};
    for (const [breakpoint, items] of Object.entries(sourceLayouts)) {
      newLayouts[breakpoint] = items.map((item) => ({
        ...item,
        i: idMap[item.i] ?? item.i,
      }));
    }

    // 付け替えたレイアウトで更新
    const updated = await tx.dashboard.update({
      where: { id: newDashboard.id },
      data: { layouts: newLayouts as Prisma.InputJsonValue },
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

    return updated;
  });

  return NextResponse.json(
    {
      data: {
        ...cloned,
        layouts: parseDashboardLayouts(cloned.layouts),
      },
    },
    { status: 201 },
  );
}

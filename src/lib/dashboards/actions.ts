"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  createDashboardInputSchema,
  parseDashboardLayouts,
} from "@/lib/dashboards/schema";

/**
 * ダッシュボード関連の Server Actions（Sprint 5 / FEAT-007）。
 *
 * - 認証・所有権チェックは各 Action 内で行う（middleware には委ねない）。
 * - ファイル先頭の `"use server"` ディレクティブにより、Client Component へ
 *   関数参照として渡せる Server Action として登録される。
 */

// ─────────────────────────────────────────────
// ダッシュボード作成
// ─────────────────────────────────────────────

export type CreateDashboardState =
  | { status: "idle" }
  | { status: "success"; dashboardId: string }
  | { status: "error"; code: string; message: string };

/**
 * 新しいダッシュボードを作成し、編集画面へリダイレクトする Server Action。
 * `<form>` の `action` 属性に渡す（`useFormState` / `useActionState` と組み合わせて使う）。
 */
export async function createDashboardAction(
  _prevState: CreateDashboardState,
  formData: FormData,
): Promise<CreateDashboardState> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      status: "error",
      code: "UNAUTHENTICATED",
      message: "Sign-in is required.",
    };
  }

  const rawInput = {
    title: formData.get("title"),
    description: formData.get("description") || undefined,
  };

  const parsed = createDashboardInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: firstIssue?.message ?? "Validation failed.",
    };
  }

  const { title, description } = parsed.data;

  const created = await prisma.dashboard.create({
    data: {
      ownerId: session.user.id,
      title,
      description: description ?? null,
      layouts: {},
    },
    select: { id: true },
  });

  redirect(`/dashboards/${created.id}`);
}

// ─────────────────────────────────────────────
// ダッシュボード削除
// ─────────────────────────────────────────────

export type DeleteDashboardState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string; message: string };

/**
 * ダッシュボードを削除する Server Action。
 * Widget は `onDelete: Cascade` のため、Dashboard 削除で自動削除される。
 */
export async function deleteDashboardAction(
  _prevState: DeleteDashboardState,
  formData: FormData,
): Promise<DeleteDashboardState> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      status: "error",
      code: "UNAUTHENTICATED",
      message: "Sign-in is required.",
    };
  }

  const dashboardId = formData.get("dashboardId");
  if (typeof dashboardId !== "string" || !dashboardId) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: "dashboardId is required.",
    };
  }

  // 所有権チェック（他人のダッシュボードは削除不可、存在しない場合も同様）
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
  });
  if (!dashboard || dashboard.ownerId !== session.user.id) {
    return {
      status: "error",
      code: "NOT_FOUND",
      message: "Dashboard not found.",
    };
  }

  await prisma.dashboard.delete({ where: { id: dashboardId } });

  redirect("/dashboards");
}

// ─────────────────────────────────────────────
// ダッシュボード複製
// ─────────────────────────────────────────────

export type CloneDashboardState =
  | { status: "idle" }
  | { status: "success"; dashboardId: string }
  | { status: "error"; code: string; message: string };

/**
 * ダッシュボードを複製し、複製先の編集画面へリダイレクトする Server Action。
 */
export async function cloneDashboardAction(
  _prevState: CloneDashboardState,
  formData: FormData,
): Promise<CloneDashboardState> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      status: "error",
      code: "UNAUTHENTICATED",
      message: "Sign-in is required.",
    };
  }

  const sourceDashboardId = formData.get("dashboardId");
  if (typeof sourceDashboardId !== "string" || !sourceDashboardId) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: "dashboardId is required.",
    };
  }

  const source = await prisma.dashboard.findUnique({
    where: { id: sourceDashboardId },
    include: { widgets: true },
  });
  if (!source || source.ownerId !== session.user.id) {
    return {
      status: "error",
      code: "NOT_FOUND",
      message: "Dashboard not found.",
    };
  }

  const sourceLayouts = parseDashboardLayouts(source.layouts);

  const cloned = await prisma.$transaction(async (tx) => {
    const newDashboard = await tx.dashboard.create({
      data: {
        ownerId: session.user.id,
        title: `${source.title} のコピー`,
        description: source.description,
        layouts: {},
      },
    });

    const idMap: Record<string, string> = {};
    for (const widget of source.widgets) {
      const newWidget = await tx.widget.create({
        data: {
          dashboardId: newDashboard.id,
          dataSourceId: widget.dataSourceId,
          type: widget.type,
          title: widget.title,
          query: widget.query ?? ({} as Prisma.InputJsonValue),
          config: widget.config ?? ({} as Prisma.InputJsonValue),
        },
      });
      idMap[widget.id] = newWidget.id;
    }

    const newLayouts: Record<string, unknown[]> = {};
    for (const [breakpoint, items] of Object.entries(sourceLayouts)) {
      newLayouts[breakpoint] = items.map((item) => ({
        ...item,
        i: idMap[item.i] ?? item.i,
      }));
    }

    const updated = await tx.dashboard.update({
      where: { id: newDashboard.id },
      data: { layouts: newLayouts as Prisma.InputJsonValue },
      select: { id: true },
    });

    return updated;
  });

  redirect(`/dashboards/${cloned.id}`);
}

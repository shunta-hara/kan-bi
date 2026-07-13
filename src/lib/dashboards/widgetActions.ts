"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  parseDashboardLayouts,
  parseWidgetConfig,
  parseWidgetQuery,
  updateWidgetInputSchema,
  widgetChartTypeSchema,
} from "@/lib/dashboards/schema";

/**
 * ウィジェット関連の Server Actions（Sprint 5 / FEAT-008）。
 */

// ─────────────────────────────────────────────
// ウィジェット追加
// ─────────────────────────────────────────────

export type AddWidgetState =
  | { status: "idle" }
  | { status: "success"; widgetId: string }
  | { status: "error"; code: string; message: string };

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

/**
 * ダッシュボードにウィジェットを追加する Server Action。
 * `dashboardId` は hidden input から受け取る。
 */
export async function addWidgetAction(
  _prevState: AddWidgetState,
  formData: FormData,
): Promise<AddWidgetState> {
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

  const rawType = formData.get("type");
  const parsedType = widgetChartTypeSchema.safeParse(rawType);
  if (!parsedType.success) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: "Invalid chart type.",
    };
  }

  const title = formData.get("title");
  const widgetTitle =
    typeof title === "string" && title.trim() ? title.trim() : null;

  const dataSourceIdRaw = formData.get("dataSourceId");
  const dataSourceId =
    typeof dataSourceIdRaw === "string" && dataSourceIdRaw.trim()
      ? dataSourceIdRaw.trim()
      : null;

  // ダッシュボードの所有権チェック
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

  // dataSourceId が指定された場合は所有確認
  if (dataSourceId !== null) {
    const ds = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
    });
    if (!ds || ds.ownerId !== session.user.id) {
      return {
        status: "error",
        code: "NOT_FOUND",
        message: "The specified data source was not found.",
      };
    }
  }

  const defaultQuery: Prisma.InputJsonValue = {
    measures: [],
    filters: [],
    sorts: [],
  };
  const defaultConfig: Prisma.InputJsonValue = {
    chartType: parsedType.data,
    showLegend: true,
    showLabels: false,
    schemaVersion: 1,
  };

  // トランザクション内でウィジェット作成 + レイアウト更新（§FR-4）
  const widget = await prisma.$transaction(async (tx) => {
    const created = await tx.widget.create({
      data: {
        dashboardId,
        dataSourceId,
        type: parsedType.data,
        title: widgetTitle,
        query: defaultQuery,
        config: defaultConfig,
      },
    });

    const currentLayouts = parseDashboardLayouts(dashboard.layouts);
    const nextY = calcNextY(currentLayouts);
    const defaultItem = { i: created.id, x: 0, y: nextY, w: 6, h: 4 };

    const updatedLayouts: Record<string, unknown[]> = {};
    for (const [bp, items] of Object.entries(currentLayouts)) {
      updatedLayouts[bp] = [...items, defaultItem];
    }
    if (Object.keys(updatedLayouts).length === 0) {
      updatedLayouts["lg"] = [defaultItem];
    }

    await tx.dashboard.update({
      where: { id: dashboardId },
      data: { layouts: updatedLayouts as Prisma.InputJsonValue },
    });

    return created;
  });

  revalidatePath(`/dashboards/${dashboardId}`);

  return { status: "success", widgetId: widget.id };
}

// ─────────────────────────────────────────────
// ウィジェット削除
// ─────────────────────────────────────────────

export type DeleteWidgetState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string; message: string };

/**
 * ウィジェットを削除し、レイアウト項目を同時に整理する Server Action（§FR-4）。
 */
export async function deleteWidgetAction(
  _prevState: DeleteWidgetState,
  formData: FormData,
): Promise<DeleteWidgetState> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      status: "error",
      code: "UNAUTHENTICATED",
      message: "Sign-in is required.",
    };
  }

  const dashboardId = formData.get("dashboardId");
  const widgetId = formData.get("widgetId");
  if (
    typeof dashboardId !== "string" ||
    !dashboardId ||
    typeof widgetId !== "string" ||
    !widgetId
  ) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: "dashboardId and widgetId are required.",
    };
  }

  // ダッシュボードの所有権チェック
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

  // ウィジェットが当該ダッシュボードに属するか確認
  const widget = await prisma.widget.findUnique({ where: { id: widgetId } });
  if (!widget || widget.dashboardId !== dashboardId) {
    return {
      status: "error",
      code: "NOT_FOUND",
      message: "Widget not found.",
    };
  }

  // トランザクション内でウィジェット削除 + レイアウト整理（§FR-4）
  await prisma.$transaction(async (tx) => {
    await tx.widget.delete({ where: { id: widgetId } });

    const currentLayouts = parseDashboardLayouts(dashboard.layouts);
    const updatedLayouts: Record<string, unknown[]> = {};
    for (const [bp, items] of Object.entries(currentLayouts)) {
      updatedLayouts[bp] = items.filter((item) => item.i !== widgetId);
    }

    await tx.dashboard.update({
      where: { id: dashboardId },
      data: { layouts: updatedLayouts as Prisma.InputJsonValue },
    });
  });

  revalidatePath(`/dashboards/${dashboardId}`);

  return { status: "success" };
}

// ─────────────────────────────────────────────
// ウィジェット更新
// ─────────────────────────────────────────────

export type UpdateWidgetState =
  | { status: "idle" }
  | {
      status: "success";
      widget: {
        id: string;
        dashboardId: string;
        dataSourceId: string | null;
        type: string;
        title: string | null;
        query: ReturnType<typeof parseWidgetQuery>;
        config: ReturnType<typeof parseWidgetConfig>;
      };
    }
  | { status: "error"; code: string; message: string };

/**
 * ウィジェットの設定（dataSourceId / title / query / config）を更新する Server Action（FEAT-008）。
 * `dashboardId` / `widgetId` は hidden input から受け取る。
 * query / config は JSON 文字列として hidden input に埋め込まれるため、ここで parse する。
 */
export async function updateWidgetAction(
  _prevState: UpdateWidgetState,
  formData: FormData,
): Promise<UpdateWidgetState> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      status: "error",
      code: "UNAUTHENTICATED",
      message: "Sign-in is required.",
    };
  }

  const dashboardId = formData.get("dashboardId");
  const widgetId = formData.get("widgetId");
  if (
    typeof dashboardId !== "string" ||
    !dashboardId ||
    typeof widgetId !== "string" ||
    !widgetId
  ) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: "dashboardId and widgetId are required.",
    };
  }

  // ダッシュボードの所有権チェック
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

  // ウィジェットが当該ダッシュボードに属するか確認
  const existingWidget = await prisma.widget.findUnique({
    where: { id: widgetId },
  });
  if (!existingWidget || existingWidget.dashboardId !== dashboardId) {
    return {
      status: "error",
      code: "NOT_FOUND",
      message: "Widget not found.",
    };
  }

  // FormData から各フィールドを取り出す
  const dataSourceIdRaw = formData.get("dataSourceId");
  const titleRaw = formData.get("title");
  const queryRaw = formData.get("query");
  const configRaw = formData.get("config");

  // JSON 文字列として渡された query / config をパース
  let queryParsed: unknown = undefined;
  if (typeof queryRaw === "string" && queryRaw) {
    try {
      queryParsed = JSON.parse(queryRaw);
    } catch {
      return {
        status: "error",
        code: "VALIDATION_ERROR",
        message: "query must be valid JSON.",
      };
    }
  }

  let configParsed: unknown = undefined;
  if (typeof configRaw === "string" && configRaw) {
    try {
      configParsed = JSON.parse(configRaw);
    } catch {
      return {
        status: "error",
        code: "VALIDATION_ERROR",
        message: "config must be valid JSON.",
      };
    }
  }

  // updateWidgetInputSchema でバリデーション
  const rawInput: Record<string, unknown> = {};
  if (dataSourceIdRaw !== null) {
    rawInput["dataSourceId"] =
      typeof dataSourceIdRaw === "string" && dataSourceIdRaw.trim()
        ? dataSourceIdRaw.trim()
        : null;
  }
  if (typeof titleRaw === "string") {
    rawInput["title"] = titleRaw.trim() || undefined;
  }
  if (queryParsed !== undefined) {
    rawInput["query"] = queryParsed;
  }
  if (configParsed !== undefined) {
    rawInput["config"] = configParsed;
  }

  const parsed = updateWidgetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message:
        parsed.error.issues[0]?.message ?? "Widget update validation failed.",
    };
  }

  const { dataSourceId, title, query, config } = parsed.data;

  // dataSourceId が指定された場合は所有確認
  if (dataSourceId !== undefined && dataSourceId !== null) {
    const ds = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
    });
    if (!ds || ds.ownerId !== session.user.id) {
      return {
        status: "error",
        code: "NOT_FOUND",
        message: "The specified data source was not found.",
      };
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

  revalidatePath(`/dashboards/${dashboardId}`);

  return {
    status: "success",
    widget: {
      id: updated.id,
      dashboardId: updated.dashboardId,
      dataSourceId: updated.dataSourceId,
      type: updated.type,
      title: updated.title,
      query: parseWidgetQuery(updated.query),
      config: parseWidgetConfig(updated.config),
    },
  };
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  canDeleteDataSource,
  parseColumnTypeOverrides,
  updateDataSourceInputSchema,
  type ColumnTypeOverrides,
  type DataSourceUsage,
} from "@/lib/sheets/schema";
import { fetchAndNormalizeSheetTable } from "@/lib/sheets/fetchSheetTable";
import { buildPreviewFromTable } from "@/lib/sheets/normalize";
import { isSheetFetchError, toSheetFetchError } from "@/lib/sheets/errors";

/**
 * `GET/PATCH/DELETE /api/datasources/:id`
 *
 * データソースの取得・更新・削除（仕様書 §9 API 設計、FEAT-003 / FEAT-004 準拠）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック（`ownerId === session.user.id`、不一致は 404）を Route Handler 側で必ず行う
 *   （.claude/rules/architecture.md: 「所有権チェックは Route Handler / Server Action 側で必ず行う」）。
 *   存在しない ID と他人の ID を区別しない（リソースの存在を漏らさないため、いずれも 404）。
 * - 削除は「使用中のデータソースは直接削除できない」（FEAT-003）をアプリ層で保護する。
 */

type RouteContext = { params: Promise<{ id: string }> };

const UNAUTHENTICATED_RESPONSE = {
  error: { code: "UNAUTHENTICATED", message: "Sign-in is required." },
} as const;

const NOT_FOUND_RESPONSE = {
  error: {
    code: "NOT_FOUND",
    message: "The requested data source was not found.",
  },
} as const;

/**
 * 利用状況（参照ウィジェット数・参照元ダッシュボード数）を取得する。
 * 「1つのデータソースを複数のダッシュボードのウィジェットから利用できる」(FEAT-003) の
 * 確認や、「使用中は直接削除できない」判定の両方で使う共通クエリ。
 */
async function loadDataSourceUsage(dataSourceId: string): Promise<{
  usage: DataSourceUsage;
  widgetIds: string[];
}> {
  const widgets = await prisma.widget.findMany({
    where: { dataSourceId },
    select: { id: true, dashboardId: true },
  });

  return {
    usage: {
      widgetCount: widgets.length,
      dashboardCount: new Set(widgets.map((widget) => widget.dashboardId)).size,
    },
    widgetIds: widgets.map((widget) => widget.id),
  };
}

/**
 * 所有権を確認しつつ対象データソースを取得する。
 * 見つからない／他人の所有物の場合は `null` を返す（呼び出し側で 404 にする）。
 */
async function findOwnedDataSource(id: string, ownerId: string) {
  const dataSource = await prisma.dataSource.findUnique({ where: { id } });
  if (!dataSource || dataSource.ownerId !== ownerId) return null;
  return dataSource;
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
  const dataSource = await findOwnedDataSource(id, session.user.id);
  if (!dataSource) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const columnTypes = parseColumnTypeOverrides(dataSource.columnTypes);
  const { usage } = await loadDataSourceUsage(dataSource.id);

  // 詳細表示では「上書きした型がデータの表示に反映される」(FEAT-004) ことをその場で
  // 確認できるよう、現在のオーバーライドを適用したプレビューを併せて返す。
  // シート側の一時的な不調で詳細表示自体が失われないよう、プレビュー取得の失敗は
  // 空のプレビューとして扱う（詳細情報自体は返す）。
  let preview;
  try {
    const table = await fetchAndNormalizeSheetTable({
      userId: session.user.id,
      spreadsheetId: dataSource.spreadsheetId,
      range: dataSource.range,
      authMode: dataSource.authMode,
      columnTypeOverrides: columnTypes,
    });
    preview = buildPreviewFromTable(table);
  } catch {
    preview = { columns: [], rows: [], totalRowCount: 0, truncated: false };
  }

  return NextResponse.json({
    data: {
      id: dataSource.id,
      name: dataSource.name,
      spreadsheetId: dataSource.spreadsheetId,
      range: dataSource.range,
      authMode: dataSource.authMode,
      refreshIntervalSec: dataSource.refreshIntervalSec,
      columnTypes,
      usage,
      syncStatus: dataSource.syncStatus,
      lastSyncedAt: dataSource.lastSyncedAt,
      lastSyncError: dataSource.lastSyncError,
      preview,
      createdAt: dataSource.createdAt,
      updatedAt: dataSource.updatedAt,
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

  const { id } = await context.params;
  const dataSource = await findOwnedDataSource(id, session.user.id);
  if (!dataSource) {
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

  const parsed = updateDataSourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The provided data source details are invalid.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const { name, range, refreshIntervalSec, columnTypes } = parsed.data;

  // `range` の変更は接続先の取得条件を変えるため、保存前に実際に取得できることを
  // 確認する（FEAT-002 の「接続検証込み」の方針を更新時にも適用する）。
  // 併せて、列型オーバーライドのキーが現在の列名と一致するかも検証し、
  // 古い列名に紐づいた無効なオーバーライドが残らないようにする。
  const effectiveRange = range ?? dataSource.range;
  const nextOverridesInput: ColumnTypeOverrides | null | undefined =
    columnTypes;

  let normalizedColumnTypes: ColumnTypeOverrides | undefined;
  if (range !== undefined || columnTypes !== undefined) {
    try {
      const table = await fetchAndNormalizeSheetTable({
        userId: session.user.id,
        spreadsheetId: dataSource.spreadsheetId,
        range: effectiveRange,
        authMode: dataSource.authMode,
      });

      const validColumnNames = new Set(
        table.columns.map((column) => column.name),
      );

      const baseOverrides =
        nextOverridesInput === undefined
          ? parseColumnTypeOverrides(dataSource.columnTypes)
          : (nextOverridesInput ?? {});

      normalizedColumnTypes = Object.fromEntries(
        Object.entries(baseOverrides).filter(([columnName]) =>
          validColumnNames.has(columnName),
        ),
      );
    } catch (error) {
      const fetchError = isSheetFetchError(error)
        ? error
        : toSheetFetchError(error);
      return NextResponse.json(
        { error: { code: fetchError.code, message: fetchError.message } },
        { status: 422 },
      );
    }
  } else if (nextOverridesInput !== undefined) {
    normalizedColumnTypes = nextOverridesInput ?? {};
  }

  const updated = await prisma.dataSource.update({
    where: { id: dataSource.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(range !== undefined ? { range } : {}),
      ...(refreshIntervalSec !== undefined ? { refreshIntervalSec } : {}),
      ...(normalizedColumnTypes !== undefined
        ? {
            // 空オブジェクトは「オーバーライドなし」として `Json?` の SQL NULL に正規化する
            // （Prisma で nullable Json フィールドを NULL にするには `Prisma.JsonNull` を使う）。
            columnTypes:
              Object.keys(normalizedColumnTypes).length > 0
                ? (normalizedColumnTypes as Prisma.InputJsonValue)
                : Prisma.JsonNull,
          }
        : {}),
    },
  });

  const { usage } = await loadDataSourceUsage(updated.id);

  return NextResponse.json({
    data: {
      id: updated.id,
      name: updated.name,
      spreadsheetId: updated.spreadsheetId,
      range: updated.range,
      authMode: updated.authMode,
      refreshIntervalSec: updated.refreshIntervalSec,
      columnTypes: parseColumnTypeOverrides(updated.columnTypes),
      usage,
      syncStatus: updated.syncStatus,
      lastSyncedAt: updated.lastSyncedAt,
      lastSyncError: updated.lastSyncError,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
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
  const dataSource = await findOwnedDataSource(id, session.user.id);
  if (!dataSource) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const { usage } = await loadDataSourceUsage(dataSource.id);

  // 「何らかのウィジェットが使用中のデータソースは直接削除できず、その旨が示される」
  // (FEAT-003 受け入れ基準) — アプリ層で拒否する（DB の FK は SetNull のため、ここで
  // 止めないと参照だけが消えて静かにグラフが壊れる）。
  if (!canDeleteDataSource(usage)) {
    return NextResponse.json(
      {
        error: {
          code: "DATA_SOURCE_IN_USE",
          message:
            "This data source is used by one or more widgets and cannot be deleted directly.",
          usage,
        },
      },
      { status: 409 },
    );
  }

  await prisma.dataSource.delete({ where: { id: dataSource.id } });

  return new NextResponse(null, { status: 204 });
}

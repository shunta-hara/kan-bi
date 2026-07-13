import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  createDataSourceInputSchema,
  parseColumnTypeOverrides,
} from "@/lib/sheets/schema";
import { fetchAndNormalizeSheetTable } from "@/lib/sheets/fetchSheetTable";
import { isSheetFetchError, toSheetFetchError } from "@/lib/sheets/errors";

/**
 * `GET /api/datasources` / `POST /api/datasources`
 *
 * データソース一覧の取得・新規登録（仕様書 §9 API 設計、FEAT-002 準拠）。
 *
 * - 認証必須（未ログインは 401）
 * - 一覧は所有者（`ownerId === session.user.id`）のものだけを返す（owner スコープ）
 * - 登録は「接続検証込み」: 実際にシートへ接続できることを確認してから永続化する
 *   （取得に失敗した場合は原因の分かるエラーを返し、レコードは作成しない）
 */

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign-in is required." } },
      { status: 401 },
    );
  }

  const dataSources = await prisma.dataSource.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      spreadsheetId: true,
      range: true,
      authMode: true,
      refreshIntervalSec: true,
      columnTypes: true,
      syncStatus: true,
      lastSyncedAt: true,
      lastSyncError: true,
      createdAt: true,
      updatedAt: true,
      widgets: {
        select: { id: true, dashboardId: true },
      },
    },
  });

  // 一覧でも「複数のダッシュボードのウィジェットから利用できる」「使用中は削除できない」を
  // 確認できるよう、利用状況（ウィジェット数・参照元ダッシュボード数）を併せて返す（FEAT-003）。
  const data = dataSources.map(({ widgets, columnTypes, ...rest }) => ({
    ...rest,
    columnTypes: parseColumnTypeOverrides(columnTypes),
    usage: {
      widgetCount: widgets.length,
      dashboardCount: new Set(widgets.map((widget) => widget.dashboardId)).size,
    },
  }));

  return NextResponse.json({ data });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign-in is required." } },
      { status: 401 },
    );
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

  const parsed = createDataSourceInputSchema.safeParse(body);
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

  const { name, spreadsheetUrl, range, authMode, refreshIntervalSec } =
    parsed.data;

  // 登録前に接続検証を行う（仕様書 §9: 「登録 (接続検証込み)」）。
  // 実際に取得・正規化できることを確認してから永続化することで、
  // 後から「取得できないデータソース」が一覧に残ることを防ぐ。
  try {
    await fetchAndNormalizeSheetTable({
      userId: session.user.id,
      spreadsheetId: spreadsheetUrl,
      range,
      authMode,
    });
  } catch (error) {
    const fetchError = isSheetFetchError(error)
      ? error
      : toSheetFetchError(error);
    return NextResponse.json(
      { error: { code: fetchError.code, message: fetchError.message } },
      { status: 422 },
    );
  }

  const created = await prisma.dataSource.create({
    data: {
      ownerId: session.user.id,
      name,
      spreadsheetId: spreadsheetUrl,
      range,
      authMode,
      refreshIntervalSec,
    },
    select: {
      id: true,
      name: true,
      spreadsheetId: true,
      range: true,
      authMode: true,
      refreshIntervalSec: true,
      syncStatus: true,
      lastSyncedAt: true,
      lastSyncError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // 新規作成直後はオーバーライド未設定・参照ウィジェット 0 件・同期未実施で確定している
  // （`dataSourceSummarySchema` の形に揃えるため明示的に補う）。
  return NextResponse.json(
    {
      data: {
        ...created,
        columnTypes: {},
        usage: { widgetCount: 0, dashboardCount: 0 },
        syncStatus: "IDLE" as const,
        lastSyncedAt: null,
        lastSyncError: null,
      },
    },
    { status: 201 },
  );
}

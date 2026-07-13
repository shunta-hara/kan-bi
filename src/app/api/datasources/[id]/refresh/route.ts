import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseColumnTypeOverrides } from "@/lib/sheets/schema";
import { fetchAndNormalizeSheetTable } from "@/lib/sheets/fetchSheetTable";
import { isSheetFetchError, toSheetFetchError } from "@/lib/sheets/errors";
import {
  checkRateLimit,
  buildRefreshRateLimitKey,
} from "@/lib/cache/rateLimit";
import {
  singleFlight,
  buildFetchSingleFlightKey,
} from "@/lib/cache/singleFlight";

/**
 * `POST /api/datasources/:id/refresh`
 *
 * データソースの「今すぐ更新」（仕様書 FEAT-005 準拠）。
 *
 * - 認証必須（未ログインは 401）
 * - 所有権チェック（ownerId 不一致は 404）
 * - レート制限: 同一ユーザー × データソースで 1 分間に 5 回まで（429）
 * - シングルフライト: 同時に複数リクエストが来ても外部 Sheets API への
 *   問い合わせは 1 回に抑制する（FEAT-005「元のシートへの問い合わせが過剰に発生しない」）
 * - 成功時: `syncStatus=OK`, `lastSyncedAt` を更新して返す
 * - REAUTH_REQUIRED 失敗時: `syncStatus=REAUTH_REQUIRED` を永続化し、
 *   UI が「再認可が必要」を表示できるようにする（FEAT-006）
 * - その他エラー: `syncStatus=ERROR`, `lastSyncError` を永続化して原因を記録する
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
  const dataSource = await prisma.dataSource.findUnique({ where: { id } });
  if (!dataSource || dataSource.ownerId !== session.user.id) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  // レート制限チェック（同一ユーザー × データソースで 1 分間に 5 回まで）
  const rateLimitKey = buildRefreshRateLimitKey(session.user.id, id);
  const rateLimitResult = checkRateLimit(rateLimitKey);
  if (!rateLimitResult.allowed) {
    const retryAfterSec = Math.ceil(rateLimitResult.retryAfterMs / 1000);
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `Too many refresh requests. Please wait ${retryAfterSec} seconds before trying again.`,
          retryAfterSec,
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  // SYNCING ステータスに更新（並行リクエストでもシングルフライトで保護されるため競合は発生しない）
  await prisma.dataSource.update({
    where: { id },
    data: { syncStatus: "SYNCING" },
  });

  const columnTypes = parseColumnTypeOverrides(dataSource.columnTypes);
  const singleFlightKey = buildFetchSingleFlightKey(id);

  try {
    // シングルフライト: 同一データソースへの並行リクエストを集約する
    await singleFlight(singleFlightKey, () =>
      fetchAndNormalizeSheetTable({
        userId: session.user.id,
        spreadsheetId: dataSource.spreadsheetId,
        range: dataSource.range,
        authMode: dataSource.authMode,
        columnTypeOverrides: columnTypes,
      }),
    );

    // 成功: syncStatus=OK, lastSyncedAt を現在時刻に更新
    const updated = await prisma.dataSource.update({
      where: { id },
      data: {
        syncStatus: "OK",
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
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
        widgets: { select: { id: true, dashboardId: true } },
      },
    });

    const { widgets, columnTypes: rawColumnTypes, ...rest } = updated;
    return NextResponse.json({
      data: {
        ...rest,
        columnTypes: parseColumnTypeOverrides(rawColumnTypes),
        usage: {
          widgetCount: widgets.length,
          dashboardCount: new Set(widgets.map((w) => w.dashboardId)).size,
        },
      },
    });
  } catch (error) {
    const fetchError = isSheetFetchError(error)
      ? error
      : toSheetFetchError(error);

    // アクセス権失効か一般エラーかでステータスを分ける（FEAT-006）
    const nextSyncStatus =
      fetchError.code === "REAUTH_REQUIRED" ? "REAUTH_REQUIRED" : "ERROR";

    const updated = await prisma.dataSource.update({
      where: { id },
      data: {
        syncStatus: nextSyncStatus,
        lastSyncError: fetchError.message,
      },
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
        widgets: { select: { id: true, dashboardId: true } },
      },
    });

    const { widgets, columnTypes: rawColumnTypes, ...rest } = updated;
    const responseData = {
      data: {
        ...rest,
        columnTypes: parseColumnTypeOverrides(rawColumnTypes),
        usage: {
          widgetCount: widgets.length,
          dashboardCount: new Set(widgets.map((w) => w.dashboardId)).size,
        },
      },
    };

    // REAUTH_REQUIRED は 401 ではなく 422 で返す（クライアントが再認可導線を表示できるよう
    // エラーコードを含めた JSON ボディが必要。401 は認証が必要であることを示す HTTP 規約と
    // 混同されやすいため区別する）。
    if (fetchError.code === "REAUTH_REQUIRED") {
      return NextResponse.json(
        {
          error: {
            code: "REAUTH_REQUIRED",
            message: fetchError.message,
          },
          data: responseData.data,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: { code: fetchError.code, message: fetchError.message } },
      { status: 422 },
    );
  }
}

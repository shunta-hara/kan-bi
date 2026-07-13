import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import {
  previewDataSourceInputSchema,
  previewResultSchema,
} from "@/lib/sheets/schema";
import { fetchSheetPreview } from "@/lib/sheets/fetchSheetTable";
import { isSheetFetchError, toSheetFetchError } from "@/lib/sheets/errors";

/**
 * `POST /api/datasources/preview`
 *
 * 登録前にスプレッドシートの内容をプレビューするための API（仕様書 FEAT-002 準拠）。
 * - 認証必須（未ログインは 401）
 * - 入力（spreadsheetUrl/range/authMode）を Zod で検証
 * - 取得失敗時は原因が分かるエラーコード・メッセージを返す（永続化は行わない）
 *
 * このルートはレコードを作成しない（プレビューのみ）。実際の登録は
 * `POST /api/datasources` が担当する。
 */
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

  const parsed = previewDataSourceInputSchema.safeParse(body);
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

  const { spreadsheetUrl, range, authMode } = parsed.data;

  try {
    const preview = await fetchSheetPreview({
      userId: session.user.id,
      spreadsheetId: spreadsheetUrl,
      range,
      authMode,
    });

    return NextResponse.json({
      data: previewResultSchema.parse(preview),
      spreadsheetId: spreadsheetUrl,
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
}

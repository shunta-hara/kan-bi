import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { deleteUserAccount } from "@/lib/account/deleteAccount";
import { deleteAccountInputSchema } from "@/lib/account/schema";

/**
 * `DELETE /api/user/account`
 *
 * 自分のアカウントと全関連データを削除する（FEAT-015）。
 *
 * - 認証必須（未ログインは 401）
 * - `{ confirmed: true }` の明示的な送信を要求する（誤操作防止）
 * - 削除後のセッション無効化は Auth.js の `signOut()` がない環境では
 *   クライアント側で `/api/auth/signout` を呼ぶことで行う
 *   （Route Handler からは `signOut()` でリダイレクトを発行できないため、
 *   204 を返してクライアント側でリダイレクト処理を行う）
 * - 所有する全データ（Dashboard / Widget / DataSource / PdfToken）を
 *   トランザクション内で削除する
 */
export async function DELETE(request: Request): Promise<NextResponse> {
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

  const parsed = deleteAccountInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Account deletion requires explicit confirmation (confirmed: true).",
        },
      },
      { status: 400 },
    );
  }

  try {
    await deleteUserAccount(session.user.id);
  } catch (error) {
    console.error("[account] failed to delete account", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            "An unexpected error occurred while deleting your account. Please try again.",
        },
      },
      { status: 500 },
    );
  }

  // 削除成功: セッション Cookie はクライアント側が /api/auth/signout を呼ぶことで無効化する
  return new NextResponse(null, { status: 204 });
}

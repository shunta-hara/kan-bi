"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { deleteUserAccount } from "@/lib/account/deleteAccount";

export type DeleteAccountState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * アカウント削除 Server Action（FEAT-015）。
 *
 * フロー:
 * 1. セッション確認（未認証は /login にリダイレクト）
 * 2. `deleteUserAccount()` でトランザクション削除
 * 3. `signOut()` でセッション Cookie を無効化して /login にリダイレクト
 *
 * 注意: `signOut({ redirectTo })` は内部で `redirect()` を投げるため、
 * try-catch の外に出す必要がある。
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const confirmed = formData.get("confirmed") === "true";
  if (!confirmed) {
    return {
      status: "error",
      message:
        "削除の確認が必要です。チェックボックスにチェックを入れてください。",
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  try {
    await deleteUserAccount(session.user.id);
  } catch (error) {
    console.error("[account] deleteAccountAction failed", error);
    return {
      status: "error",
      message:
        "アカウントの削除中にエラーが発生しました。しばらくしてから再試行してください。",
    };
  }

  // 削除成功後: セッションを無効化してログインページへリダイレクト
  await signOut({ redirectTo: "/login" });

  // signOut が redirect() を投げるため、ここには到達しない
  return { status: "success" };
}

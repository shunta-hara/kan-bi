"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth/auth";

/**
 * ログイン・ログアウトの Server Action（仕様書 FEAT-001 / §7 準拠）。
 *
 * - Google OAuth フローの開始・終了のみをサーバー側で完結させる
 *   （クライアントに認証情報・トークンを渡さない）。
 * - `callbackUrl` は同一オリジン内の相対パスのみ許可し、オープンリダイレクトを防ぐ。
 * - 成功・失敗の記録は `lib/auth/auth.ts` の Auth.js イベント/ロガーで監査ログに残す。
 */

const callbackUrlSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return "/dashboards";
    // 相対パス（先頭が "/" かつ "//" で始まらない）のみ許可する。
    if (value.startsWith("/") && !value.startsWith("//")) {
      return value;
    }
    return "/dashboards";
  });

export async function signInWithGoogleAction(
  formData: FormData,
): Promise<void> {
  const callbackUrl = callbackUrlSchema.parse(
    formData.get("callbackUrl") ?? undefined,
  );

  try {
    await signIn("google", { redirectTo: callbackUrl });
  } catch (error) {
    // `signIn` 成功時、Next.js は内部的に `NEXT_REDIRECT` を `throw` してリダイレクトを実現する。
    // それは `AuthError` ではないため、ここでは関知せずそのまま再送出する
    // （Auth.js 公式ドキュメント推奨のハンドリングパターン）。
    if (error instanceof AuthError) {
      redirect(`/login?error=${error.type}`);
    }
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

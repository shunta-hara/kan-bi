import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

/**
 * Edge Runtime（`middleware.ts`）専用の `auth`。
 *
 * `authConfig`（`PrismaAdapter` を含まない軽量設定）だけから `NextAuth` を構成するため、
 * `pg` / Node.js `crypto` への依存を一切引き込まない。
 *
 * - セッションの実体（DB セッション）の検証はフル設定側（`auth.ts`）と Adapter が担うが、
 *   `middleware` ではリクエストの JWT/Cookie からセッションの有無を判定できれば十分であり、
 *   ここでは `authConfig.callbacks.authorized` を介して「ログイン済みかどうか」のみを使う。
 * - DB アクセス・監査ログの記録などは行わない（Node.js ランタイム側 `auth.ts` の責務）。
 *
 * 参考: https://authjs.dev/guides/edge-compatibility
 */
export const { auth: authEdge } = NextAuth(authConfig);

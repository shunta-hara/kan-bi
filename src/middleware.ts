import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { authEdge } from "@/lib/auth/auth.edge";
import { isProtectedPath } from "@/lib/auth/protectedPaths";

/**
 * 認証ガード用ミドルウェア（仕様書 §4, §7, §FR-6 準拠）
 *
 * - ここでは「セッションの有無」だけを判定する。所有権・ロールなどの認可は
 *   各 Route Handler / Server Action 側で行う（middleware に書かない）。
 * - 未ログインで保護ルートにアクセスした場合は `/login` にリダイレクトする
 *   （元のアクセス先を `callbackUrl` として付与し、ログイン後に戻れるようにする）。
 * - ログイン済みで `/login` にアクセスした場合はダッシュボード一覧へ送る。
 * - 保護パスの判定ロジックは `lib/auth/protectedPaths.ts` に切り出している
 *   （`server-only` 経由の依存を持たず、ユニットテストから直接検証できるようにするため）。
 * - ここで使う `authEdge` は `auth.edge.ts`（`PrismaAdapter` を含まない軽量設定由来）の
 *   `auth` であり、`pg` / Node.js `crypto` を一切ロードしない（Edge Runtime 互換）。
 *   フル設定（DB アダプタ・監査ログを含む `auth.ts`）は Route Handler / Server Component /
 *   Server Action など Node.js ランタイムでのみ使用する。
 *   参考: https://authjs.dev/guides/edge-compatibility
 */

export default authEdge((req: NextAuthRequest) => {
  const { nextUrl } = req;
  const isLoggedIn = Boolean(req.auth);
  const pathname = nextUrl.pathname;

  if (isProtectedPath(pathname) && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboards", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Next.js の内部アセット・静的ファイル・API 認証ルートは対象外にする
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

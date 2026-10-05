/**
 * Auth.js JWT セッション Cookie 生成・注入ヘルパー (FEAT-E2E-001)。
 *
 * 実際の Google OAuth フローを経由せず、Auth.js の内部 JWT エンコードと同じ
 * 方式で署名済み Cookie を生成してブラウザコンテキストに注入する。
 *
 * Cookie 名: authjs.session-token
 * - HTTP ポートで動作するため __Secure- プレフィックスなし
 * - encode の salt = Cookie 名（Auth.js v5 の仕様）
 *
 * 実装の根拠:
 * - auth.config.ts で session.strategy: "jwt" を明示しているため、
 *   middleware (auth.edge.ts) と Route Handler (auth.ts) の両方が
 *   同じ JWT Cookie を同じ方法で検証する
 * - token.sub に userId をセットすれば session.user.id に復元される
 *   (auth.ts の session コールバック参照)
 */

import { encode } from "next-auth/jwt";
import type { BrowserContext } from "@playwright/test";

/** Auth.js が使用するセッション Cookie の名前 */
export const SESSION_COOKIE_NAME = "authjs.session-token";

/** セッション注入に必要なユーザー情報 */
export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

/**
 * 指定ユーザーの Auth.js JWT セッション Cookie 値を生成する。
 *
 * @param user セッションに埋め込むユーザー情報
 * @returns 署名済み JWT 文字列
 * @throws AUTH_SECRET が未設定の場合
 */
export async function createSessionCookieValue(
  user: SessionUser,
): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Ensure .env.e2e is loaded before creating session cookies.",
    );
  }

  return encode({
    token: {
      sub: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
    },
    secret,
    salt: SESSION_COOKIE_NAME,
    maxAge: 60 * 60, // 1 hour — short-lived for E2E tests (spec: non-functional requirement)
  });
}

/**
 * Playwright ブラウザコンテキストに Auth.js セッション Cookie を注入する。
 *
 * 注入後、そのコンテキストのブラウザページから保護ルート (/dashboards 等) に
 * アクセスしてもリダイレクトされない（ログイン済み状態になる）。
 *
 * @param context Playwright の BrowserContext
 * @param user セッションに埋め込むユーザー情報
 */
export async function injectSessionCookie(
  context: BrowserContext,
  user: SessionUser,
): Promise<void> {
  const token = await createSessionCookieValue(user);
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3001";
  const { hostname } = new URL(baseUrl);

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: hostname,
      path: "/",
      httpOnly: true,
      secure: false, // http なので false
      sameSite: "Lax",
    },
  ]);
}

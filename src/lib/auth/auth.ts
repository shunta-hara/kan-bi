import "server-only";

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/auditLog";
import { authConfig } from "@/lib/auth/auth.config";

/**
 * Auth.js v5 のフル設定（仕様書 §3, §7, §FR-6 準拠）
 *
 * `authConfig`（providers / pages / callbacks.authorized のみの軽量設定。Edge Runtime 互換）
 * を土台に、Node.js ランタイム専用の機能（Prisma Adapter・DB セッション・監査ログ）を追加する。
 *
 * - このモジュールは `import "server-only"` 経由で `@/lib/db/prisma`
 *   （→ `@prisma/adapter-pg` → `pg` → Node.js `crypto`）に依存するため、
 *   Route Handler / Server Component / Server Action など Node.js ランタイムでのみ
 *   import すること。`middleware.ts`（Edge Runtime）からは `auth.edge.ts` を使う。
 * - Google OAuth + Prisma Adapter（アカウント/リフレッシュトークン等を DB に永続化。
 *   FEAT-006 の再認可導線の基盤。セッション戦略には影響させない）
 * - `access_type=offline` + `prompt=consent` でリフレッシュトークンを取得
 *   （Sprint 1 では Sheets スコープの増分付与は行わず、基本のログインのみ）
 * - セッションは `authConfig` で明示している JWT 戦略（署名付き Cookie）を使う
 *   （`adapter` の有無で戦略が変わらないようにするため、ここで上書きしない。
 *   理由は `auth.config.ts` 冒頭のコメントを参照: database/jwt の戦略不一致が
 *   middleware の `req.auth` 常時 null という致命的リグレッションを引き起こしていた）
 * - 認証成功・失敗・サインアウトを監査ログに記録する
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // 認証エラー（OAuth コールバック失敗・アクセス拒否など）を監査ログに記録する。
  // Auth.js v5 では失敗時に `user` が確定しないため、logger 経由で捕捉する。
  logger: {
    error(error: Error) {
      void recordAuditEvent({
        type: "AUTH_SIGN_IN_FAILURE",
        metadata: {
          provider: "google",
          reason: error.name,
          message: error.message,
        },
      });
      console.error(`[auth] ${error.name}: ${error.message}`);
    },
  },
  callbacks: {
    // `authConfig.callbacks.authorized` を引き継ぐ（middleware からの利用は `auth.edge.ts`
    // 経由が基本だが、フル設定でも一貫した認可判定を保つため明示的に継承しておく）。
    authorized: authConfig.callbacks.authorized,
    // JWT 戦略では `user`（DB レコード）ではなく `token`（署名付き JWT の中身）が渡される。
    // `token.sub` は `authConfig.callbacks.jwt` でサインイン時に確定済みのユーザー ID
    // （Adapter が払い出した `User.id`）であり、これを `session.user.id` に復元することで
    // Route Handler / Server Component 側は DB に問い合わせず owner スコープの判定に使える。
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      // PrismaAdapter は既存ユーザーの再ログイン時に Account を更新しない。
      // scope / access_token / refresh_token を常に最新値で上書きすることで、
      // Sheets スコープ追加後の再ログインが有効になるようにする。
      if (account && user.id) {
        await prisma.account.updateMany({
          where: { userId: user.id, provider: account.provider },
          data: {
            access_token: account.access_token,
            ...(account.refresh_token
              ? { refresh_token: account.refresh_token }
              : {}),
            expires_at: account.expires_at,
            scope: account.scope,
          },
        });
      }
      await recordAuditEvent({
        type: "AUTH_SIGN_IN_SUCCESS",
        userId: user.id,
        email:
          user.email ??
          (typeof profile?.email === "string" ? profile.email : undefined),
        metadata: {
          provider: "google",
          isNewUser: Boolean(isNewUser),
        },
      });
    },
    async signOut(message) {
      const userId = "session" in message ? message.session?.userId : undefined;
      await recordAuditEvent({
        type: "AUTH_SIGN_OUT",
        userId: userId ?? undefined,
        metadata: { provider: "google" },
      });
    },
  },
});

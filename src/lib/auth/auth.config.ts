import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js v5 の「軽量設定」（Edge Runtime 互換）。
 *
 * Next.js の `middleware.ts` はデフォルトで Edge Runtime 上でビルド・実行されるため、
 * `PrismaAdapter`（→ `@/lib/db/prisma` → `@prisma/adapter-pg` → `pg` → Node.js `crypto`）を
 * 含む完全な設定を import すると「The edge runtime does not support Node.js 'crypto' module」
 * でミドルウェアのコンパイル自体が失敗し、アプリ全体が起動不能になる。
 *
 * これを避けるため、Auth.js 公式の "split config" パターンを採用する:
 *   - この `auth.config.ts`: providers / pages / session / callbacks のみ
 *     （DB アダプタ・監査ログなど Node.js 専用の依存を一切含まない）
 *   - `auth.ts`: この設定に `PrismaAdapter`（OAuth アカウント・トークンの永続化用）等を
 *     追加した完全版（Route Handler / Server Component / Server Action など
 *     Node.js ランタイムでのみ使用する）
 *   - `middleware.ts`: この軽量設定だけを使う `auth`（`auth.edge.ts`）を import する
 *
 * 参考: https://authjs.dev/guides/edge-compatibility
 *
 * ## セッション戦略を JWT に統一する理由（重要・過去の致命的バグの再発防止）
 *
 * `@auth/core` はセッション戦略未指定の場合 `config.adapter ? "database" : "jwt"` で
 * 戦略を推論する（`@auth/core/lib/init.js`）。そのため、共有設定にセッション戦略を
 * 明示しないと、`adapter` を持つ `auth.ts`（Node 側）は "database" 戦略で
 * `crypto.randomUUID()` の不透明トークンを `authjs.session-token` Cookie に発行する一方、
 * `adapter` を持たない `auth.edge.ts`（middleware 側）は "jwt" 戦略にフォールバックし、
 * 同じ Cookie を `jwt.decode()` しようとして必ず失敗する
 * （`JWTSessionError` → Cookie クリア → `req.auth` が常に `null`）。
 * 結果としてログイン済みでも保護ページに到達できない無限リダイレクトが発生していた。
 *
 * これを防ぐため、**この共有設定で `session.strategy: "jwt"` を明示**し、
 * `auth.ts`/`auth.edge.ts` の両方が同じ戦略・同じ Cookie 形式（署名付き JWT）を
 * 使うことを保証する。`PrismaAdapter` は引き続き `auth.ts` 側で OAuth アカウント・
 * リフレッシュトークン等の永続化（FEAT-006 の再認可導線の基盤）に利用する
 * （Adapter の有無がセッション戦略の推論に影響しないようにする）。
 * Cookie の署名・暗号化には `AUTH_SECRET` を使用する。
 */
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/spreadsheets.readonly",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  session: {
    // 上記コメント参照: adapter の有無に関わらず "jwt" に固定する
    // （middleware／Route Handler 双方が同じ Cookie を同じ方法で検証できるようにする）。
    strategy: "jwt",
  },
  callbacks: {
    // `middleware.ts` から `auth()` を呼び出した際にセッションの有無だけを判定するために使う。
    // ここでは認可（所有権・ロール等）の判断はせず、「ログイン済みかどうか」のみを返す
    // （所有権・ロールなどの認可は各 Route Handler / Server Action 側で行う）。
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    // JWT 戦略では、サインイン直後のリクエストにのみ `user`（Adapter が払い出した DB 上の
    // ユーザー）が渡される。以降のリクエストでは `token` のみが渡されるため、ここで
    // `token.sub` にユーザー ID を確定させ、後続の `session` コールバック（`auth.ts`）が
    // DB に問い合わせず `token.sub` から `session.user.id` を復元できるようにする。
    // （`token.sub` は JWT の標準クレームであり、Auth.js は既定で `user.id` を設定するが、
    // 明示しておくことで挙動を固定し、将来の仕様変更に左右されないようにする。）
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
  },
} satisfies NextAuthConfig;

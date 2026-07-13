import type { DefaultSession } from "next-auth";

// `session.user.id` を型に含める（Auth.js 標準の `DefaultSession` には含まれないため拡張する）。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

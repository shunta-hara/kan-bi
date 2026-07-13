import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";

/**
 * トップページ。
 * ログイン済みならダッシュボード一覧へ、未ログインならログイン画面へ振り分ける
 * （仕様書 UXフロー §1: 「ユーザーはトップページから Google アカウントでログインする」）。
 */
export default async function Home() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboards");
  }

  redirect("/login");
}

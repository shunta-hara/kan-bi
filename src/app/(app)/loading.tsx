import { getTranslations } from "next-intl/server";

/**
 * (app) グループ全体の Suspense ローディング UI（Sprint 10 / FEAT-016）。
 *
 * Next.js の loading.tsx はセグメントの遷移中に自動表示される。
 * 最小限のスケルトン UI でローディング状態をユーザーに伝える。
 */
export default async function AppLoading() {
  const t = await getTranslations("loading");

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-label={t("message")}
    >
      <div className="flex flex-col items-center gap-3">
        {/* スピナー */}
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-black/60 dark:border-white/10 dark:border-t-white/60"
          aria-hidden="true"
        />
        <span className="text-sm text-black/50 dark:text-white/50">
          {t("message")}
        </span>
      </div>
    </div>
  );
}

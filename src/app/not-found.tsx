import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * グローバル 404 ページ（Sprint 10 / FEAT-016）。
 *
 * - notFound() が呼ばれたとき、またはルートが存在しないときに表示される。
 * - ホームへ戻るリンクを提供する。
 */
export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-6xl font-bold text-black/20 dark:text-white/20">
          404
        </p>
        <h1 className="text-xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {t("notFoundDescription")}
        </p>
      </div>
      <Link
        href="/dashboards"
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
      >
        {t("backToHome")}
      </Link>
    </div>
  );
}

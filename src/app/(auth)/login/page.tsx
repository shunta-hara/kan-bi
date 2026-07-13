import { getTranslations } from "next-intl/server";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

/**
 * ログイン画面（FEAT-001 / Sprint 1）。
 *
 * - 未ログイン状態で保護ルートにアクセスすると middleware からこの画面に誘導される。
 * - `callbackUrl`: ログイン後に戻る相対パス（middleware が付与）。
 * - `error`: Auth.js が認証失敗時に付与するエラー種別。文言は i18n メッセージから解決する。
 */

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl, error } = await searchParams;
  const t = await getTranslations("login");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-black/10 p-8 text-center shadow-sm dark:border-white/15">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {t("description")}
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            <p className="font-medium">{t("errorTitle")}</p>
            <p>{t("errorDescription")}</p>
          </div>
        ) : null}

        <GoogleSignInButton
          callbackUrl={callbackUrl}
          label={t("googleButton")}
        />
      </div>
    </main>
  );
}

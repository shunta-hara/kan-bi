"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: Props) {
  const t = useTranslations("errors");
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {t("errorDescription")}
        </p>

        {isDev && (
          <div className="w-full rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-left dark:border-amber-800 dark:bg-amber-950">
            <p className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              開発環境のエラー詳細
            </p>
            <p className="font-mono text-sm text-amber-800 dark:text-amber-200">
              {error.message}
            </p>
            {error.digest && (
              <p className="mt-1 font-mono text-xs text-amber-600 dark:text-amber-400">
                digest: {error.digest}
              </p>
            )}
            {error.stack && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-amber-700 dark:text-amber-300">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
        >
          {t("retryButton")}
        </button>
      </div>
    </div>
  );
}

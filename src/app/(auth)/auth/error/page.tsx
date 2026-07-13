import Link from "next/link";

/**
 * Auth.js カスタムエラーページ（auth.config.ts の pages.error に登録）。
 *
 * - dev: エラーコード + 診断ヒントを表示する
 * - prod: エラーコードのみ（スタック・内部情報は非表示）
 */

const AUTH_ERROR_HINTS: Record<string, string> = {
  Configuration:
    "サーバー設定に問題があります。DATABASE_URL・AUTH_GOOGLE_ID/SECRET・AUTH_SECRET が正しく設定されているか確認してください。",
  AccessDenied: "アクセスが拒否されました。",
  Verification: "確認リンクが無効または期限切れです。",
  OAuthSignin: "OAuth サインイン開始に失敗しました。",
  OAuthCallback: "OAuth コールバックの処理に失敗しました。",
  OAuthCreateAccount: "OAuth アカウントの作成に失敗しました。",
  EmailCreateAccount: "メールアカウントの作成に失敗しました。",
  Callback: "コールバック処理中にエラーが発生しました。",
  OAuthAccountNotLinked:
    "このメールアドレスは別のプロバイダーで登録されています。",
  SessionRequired: "このページにアクセスするにはサインインが必要です。",
  Default: "認証中に予期しないエラーが発生しました。",
};

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const code = error ?? "Default";
  const hint = AUTH_ERROR_HINTS[code] ?? AUTH_ERROR_HINTS["Default"];
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-black/10 p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-red-600">認証エラー</h1>

        <div className="rounded-md border border-black/10 bg-black/[.03] px-4 py-2 text-left">
          <p className="text-xs text-black/50">エラーコード</p>
          <p className="font-mono text-sm font-medium">{code}</p>
        </div>

        {isDev && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-left">
            <p className="mb-1 text-xs font-semibold text-amber-700">
              開発環境の診断ヒント
            </p>
            <p className="text-sm text-amber-800">{hint}</p>
            <p className="mt-2 text-xs text-amber-600">
              詳細なスタックトレースはサーバーコンソール（pnpm dev
              のターミナル）を確認してください。
            </p>
          </div>
        )}

        <Link
          href="/login"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
        >
          ログイン画面に戻る
        </Link>
      </div>
    </div>
  );
}

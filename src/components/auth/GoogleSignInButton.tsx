import { signInWithGoogleAction } from "@/lib/auth/actions";

type GoogleSignInButtonProps = {
  callbackUrl?: string;
  label: string;
};

/**
 * Google ログインボタン（表示専用）。
 * 実際の OAuth フロー開始は Server Action（`signInWithGoogleAction`）に委ねる。
 */
export function GoogleSignInButton({
  callbackUrl,
  label,
}: GoogleSignInButtonProps) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        {label}
      </button>
    </form>
  );
}

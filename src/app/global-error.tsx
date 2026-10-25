"use client";

/**
 * グローバルエラー境界（FEAT-SEN-003）。
 *
 * Next.js App Router では、レイアウト自体でエラーが発生した場合や
 * ルートレイアウト外のエラーをキャッチするために使われる。
 * `<html>` / `<body>` を含む必須構造が必要。
 * DSN 未設定時は Sentry 送信を行わず、console.error のみ記録する。
 * @sentry/nextjs は動的 import 経由で参照し、バンドルに含めない。
 */

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/reportClientError";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
    void reportClientError(error);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1.5rem",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            予期しないエラーが発生しました
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#666" }}>
            お手数ですが、しばらくしてから再試行してください。
          </p>
          {process.env.NODE_ENV === "development" && error.message && (
            <pre
              style={{
                maxWidth: "600px",
                padding: "1rem",
                background: "#fff8e1",
                border: "1px solid #ffe082",
                borderRadius: "4px",
                fontSize: "0.75rem",
                textAlign: "left",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "9999px",
              background: "#111",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}

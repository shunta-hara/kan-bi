"use client";

/**
 * PDF ダウンロードボタン（FEAT-013 / Sprint 8）。
 *
 * - 用紙サイズ（A4/A3）と向き（縦/横）を選択してから PDF をダウンロードできる。
 * - `GET /api/dashboards/:id/pdf` を fetch してバイナリを受け取り、
 *   ブラウザの `<a>` download でファイルとして保存させる。
 * - Auth.js セッション Cookie が自動送信されるため、追加のトークン管理は不要。
 */

import { useState } from "react";

type PaperSize = "A4" | "A3";
type Orientation = "portrait" | "landscape";

type Props = {
  dashboardId: string;
  /** ダッシュボードのウィジェット数（0 のとき警告を表示）（FEAT-BF-008） */
  widgetCount: number;
  labels: {
    button: string;
    downloading: string;
    paperSizeLabel: string;
    orientationLabel: string;
    paperSizeA4: string;
    paperSizeA3: string;
    orientationPortrait: string;
    orientationLandscape: string;
    downloadButton: string;
    cancelButton: string;
    /** 500 やネットワークエラー等の汎用エラーメッセージ */
    errorMessage: string;
    /** 401 Unauthorized（ログインセッション切れ）のエラーメッセージ */
    error401: string;
    /** 404 Not Found（ダッシュボードが存在しない）のエラーメッセージ */
    error404: string;
    /** ウィジェットが 0 件のとき PDF 出力前に表示する警告メッセージ */
    noWidgetsWarning: string;
  };
};

export function PdfDownloadButton({ dashboardId, widgetCount, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ paperSize, orientation });
      const res = await fetch(
        `/api/dashboards/${dashboardId}/pdf?${params.toString()}`,
        { method: "GET" },
      );

      if (!res.ok) {
        // HTTP ステータスに応じてユーザー向けメッセージを出し分ける（FEAT-BF-008）
        if (res.status === 401) {
          setError(labels.error401);
        } else if (res.status === 404) {
          setError(labels.error404);
        } else {
          setError(labels.errorMessage);
        }
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Content-Disposition からファイル名を取得（フォールバック付き）
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch =
        disposition.match(/filename\*=UTF-8''([^;]+)/) ??
        disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1])
        : `dashboard_${dashboardId}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setOpen(false);
    } catch {
      setError(labels.errorMessage);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setError(null);
        }}
        className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {labels.button}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="PDF 出力オプション"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-black/10 bg-white p-4 shadow-lg dark:border-white/15 dark:bg-neutral-900"
        >
          {/* 用紙サイズ */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-black/70 dark:text-white/70">
              {labels.paperSizeLabel}
            </label>
            <div className="flex gap-2">
              {(["A4", "A3"] as PaperSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperSize(size)}
                  className={[
                    "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    paperSize === size
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "border-black/10 hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]",
                  ].join(" ")}
                  aria-pressed={paperSize === size}
                >
                  {size === "A4" ? labels.paperSizeA4 : labels.paperSizeA3}
                </button>
              ))}
            </div>
          </div>

          {/* 向き */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-black/70 dark:text-white/70">
              {labels.orientationLabel}
            </label>
            <div className="flex gap-2">
              {(["portrait", "landscape"] as Orientation[]).map((ori) => (
                <button
                  key={ori}
                  type="button"
                  onClick={() => setOrientation(ori)}
                  className={[
                    "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    orientation === ori
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "border-black/10 hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]",
                  ].join(" ")}
                  aria-pressed={orientation === ori}
                >
                  {ori === "portrait"
                    ? labels.orientationPortrait
                    : labels.orientationLandscape}
                </button>
              ))}
            </div>
          </div>

          {/* ウィジェット 0 件の警告（FEAT-BF-008） */}
          {widgetCount === 0 && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
            >
              {labels.noWidgetsWarning}
            </p>
          )}

          {/* エラー表示 */}
          {error !== null && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}

          {/* ボタン */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-50"
            >
              {downloading ? labels.downloading : labels.downloadButton}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.05] dark:border-white/15 dark:hover:bg-white/[.06]"
            >
              {labels.cancelButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

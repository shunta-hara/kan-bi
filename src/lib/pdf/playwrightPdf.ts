import "server-only";

/**
 * Playwright を使って印刷ページを PDF にレンダリングするサーバー専用モジュール（FEAT-013）。
 *
 * Vercel/Lambda 環境では通常の Chromium が動作しないため、
 * `@sparticuz/chromium` の軽量版を使用する。
 * ローカル開発では `playwright` がインストール済みの Chrome/Chromium を使用する。
 *
 * セキュリティ: PDF トークンは `X-Pdf-Token` ヘッダーで渡す（URL に含めない）。
 */

import { chromium } from "playwright";

type GeneratePdfOptions = {
  /** ダッシュボード ID（URL パスに使用） */
  dashboardId: string;
  /** 印刷ページ認証用の PDF トークン（単回使用） */
  pdfToken: string;
  /** 用紙フォーマット */
  format: "A4" | "A3";
  /** 横向き出力か */
  landscape: boolean;
  /** アプリのベース URL（例: https://example.com） */
  baseUrl: string;
};

/**
 * Playwright で `/dashboards/:id/print` をレンダリングし、PDF バイナリを返す。
 *
 * @throws Error - ブラウザ起動・ページロード・PDF 生成に失敗した場合
 */
export async function generateDashboardPdf(
  options: GeneratePdfOptions,
): Promise<Buffer> {
  const { dashboardId, pdfToken, format, landscape, baseUrl } = options;

  // Vercel/Lambda 環境では @sparticuz/chromium を使用する
  // ローカル開発では playwright の標準 Chromium を使用する
  const isVercel =
    process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME != null;

  let executablePath: string | undefined;
  if (isVercel) {
    // @sparticuz/chromium は動的 import が必要（Edge ビルドで静的解析されないよう）
    const sparticuz = await import("@sparticuz/chromium");
    executablePath = await sparticuz.default.executablePath();
  }

  const browser = await chromium.launch({
    executablePath,
    args: isVercel
      ? [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--single-process",
        ]
      : [],
  });

  try {
    const context = await browser.newContext({
      // PDF 生成は印刷スタイルを使用
      colorScheme: "light",
      extraHTTPHeaders: {
        // PDF トークンをヘッダーで渡す（URL に含めない）
        "x-pdf-token": pdfToken,
      },
    });

    const page = await context.newPage();

    const printUrl = `${baseUrl}/dashboards/${dashboardId}/print`;

    // ページ読み込み（ネットワーク完了 + アニメーション完了まで待つ）
    await page.goto(printUrl, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    // 全 ECharts インスタンスの描画完了を待機する（FEAT-BF-002）。
    // 印刷ページのクライアントコードが全チャートの `finished` イベント発火後に
    // `window.__chartsReady = true` をセットする。
    // - グラフなしダッシュボードの場合も即時フラグが立つため PDF 生成が完了する。
    // - 固定 1500ms 待機を廃止し、描画完了を正確に検知することで所要時間を短縮する。
    // 第 2 引数は `arg`（ページ関数への引数）であり、タイムアウトは第 3 引数 `options` で渡す。
    await page.waitForFunction("window.__chartsReady === true", undefined, {
      timeout: 15_000,
    });

    const pdfBuffer = await page.pdf({
      format,
      landscape,
      printBackground: true,
      margin: {
        top: "16mm",
        bottom: "16mm",
        left: "12mm",
        right: "12mm",
      },
    });

    await context.close();
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

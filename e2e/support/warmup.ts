/**
 * E2E のウォームアップ（Playwright の globalSetup）。
 *
 * E2E は `next dev` で起動するため、各ルートは初めて要求されたときにコンパイルされる。
 * 重いルート（`/dashboards/[id]` は 6〜10 秒かかることがある）の初回コンパイルが
 * テスト本体の待ち時間（リダイレクトの 15 秒など）に含まれると、マシンが遅いときだけ
 * 失敗する不安定なテストになる（master でも発生した）。
 *
 * テスト開始前に、シードしたユーザーで主要ルートを 1 回ずつ要求してコンパイルを済ませる。
 * webServer は globalSetup より先に起動している。
 */

import { request, type APIRequestContext } from "@playwright/test";

import { cleanupUsers, createTestDashboard, createTestUser } from "./db";
import { createTestPdfToken, cleanupPdfTokensByUserId } from "./pdfToken";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "./session";

/** 1 ルートあたりの上限（初回コンパイル込み） */
const WARMUP_REQUEST_TIMEOUT_MS = 90_000;

/**
 * 1 ルートを要求してコンパイルさせる。目的はコンパイルなので失敗はさせないが、
 * 5xx のときはどのルートかを警告する（壊れたルートを静かに通して原因を見えにくくしない）。
 */
async function warm(
  context: APIRequestContext,
  path: string,
  headers?: Record<string, string>,
): Promise<void> {
  const response = await context.get(path, { headers, maxRedirects: 0 });
  if (response.status() >= 500) {
    console.warn(`[e2e warmup] ${path} returned ${response.status()}`);
  }
}

export default async function warmup(): Promise<void> {
  const baseURL = process.env.AUTH_URL ?? "http://localhost:3001";
  const user = await createTestUser("warmup");

  try {
    const dashboard = await createTestDashboard(user.id, "warmup");
    const sessionValue = await createSessionCookieValue(user);
    const api = await request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `${SESSION_COOKIE_NAME}=${sessionValue}` },
      timeout: WARMUP_REQUEST_TIMEOUT_MS,
    });

    // Cookie なしの要求。ログイン済みで /login に来るとミドルウェアが /dashboards へ
    // リダイレクトして /login ページがコンパイルされないため、/ と /login は別に要求する
    const anonymous = await request.newContext({
      baseURL,
      timeout: WARMUP_REQUEST_TIMEOUT_MS,
    });

    try {
      for (const path of ["/", "/login"]) {
        await warm(anonymous, path);
      }

      // ページ（ログイン済みで描画されるもの）
      for (const path of [
        "/dashboards",
        "/datasources",
        `/dashboards/${dashboard.id}`,
      ]) {
        await warm(api, path);
      }

      // 印刷ページはトークン必須。トークンは単回使用なので専用のものを 1 つ消費する
      const token = await createTestPdfToken(user.id, dashboard.id);
      await warm(api, `/dashboards/${dashboard.id}/print`, {
        "x-pdf-token": token,
      });
    } finally {
      await anonymous.dispose();
      await api.dispose();
    }
  } finally {
    await cleanupPdfTokensByUserId([user.id]);
    await cleanupUsers([user.id]);
  }
}

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

import { request } from "@playwright/test";

import {
  cleanupUsers,
  createTestDashboard,
  createTestUser,
} from "./db";
import { createTestPdfToken, cleanupPdfTokensByUserId } from "./pdfToken";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "./session";

/** 1 ルートあたりの上限（初回コンパイル込み） */
const WARMUP_REQUEST_TIMEOUT_MS = 90_000;

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

    try {
      // ページ（ログイン済みで描画されるもの）。レスポンスの内容は問わず、コンパイルさせるのが目的
      for (const path of [
        "/login",
        "/dashboards",
        "/datasources",
        `/dashboards/${dashboard.id}`,
      ]) {
        await api.get(path);
      }

      // 印刷ページはトークン必須。トークンは単回使用なので専用のものを 1 つ消費する
      const token = await createTestPdfToken(user.id, dashboard.id);
      await api.get(`/dashboards/${dashboard.id}/print`, {
        headers: { "x-pdf-token": token },
      });
    } finally {
      await api.dispose();
    }
  } finally {
    await cleanupPdfTokensByUserId([user.id]);
    await cleanupUsers([user.id]);
  }
}

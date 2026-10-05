/**
 * FEAT-E2E-007: データ取得失敗ウィジェットの分離表示
 *
 * データ取得が失敗したウィジェットが他ウィジェットに影響を与えないことを検証する。
 * 3 種類のウィジェット（正常・FORBIDDEN・REAUTH_REQUIRED）を同一ページに配置し、
 * 各ウィジェットが独立してエラー状態を表示することを確認する。
 *
 * 失敗の作り分け:
 * - FORBIDDEN: docs.google.com の URL パスに "-forbidden-" を含む spreadsheetId を使う
 *   → fetch-stub.mjs が 403 を返す → gviz エラー分類で FORBIDDEN → エラーカード
 * - REAUTH_REQUIRED: OAUTH モードのデータソース + 期限切れ Account を作成し、
 *   refresh_token に "e2e-reauth-invalid" を含めると fetch-stub.mjs が
 *   oauth2.googleapis.com に 400 invalid_grant を返す → REAUTH_REQUIRED → 再認可カード
 */

import { test, expect } from "@playwright/test";

import {
  createTestUser,
  createTestDashboard,
  createTestDataSource,
  createTestWidget,
  createTestOAuthAccount,
  cleanupUsers,
} from "./support/db";
import { injectSessionCookie } from "./support/session";
import { REAUTH_INVALID_REFRESH_TOKEN } from "./support/stub-constants";

// ウィジェットタイトル（DB で直接作成するため、UI で一意に識別できる名前にする）
const WIDGET_TITLE_NORMAL = "E2E 正常ウィジェット";
const WIDGET_TITLE_FORBIDDEN = "E2E 取得失敗ウィジェット";
const WIDGET_TITLE_REAUTH = "E2E 再認可ウィジェット";

test("正常・FORBIDDEN・REAUTH_REQUIRED ウィジェットが同一ページで共存し、それぞれ正しく表示される", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);

  // ─── ページエラー監視 ───
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // 既知のノイズを除外する（理由付き）:
      //
      // 1. React の DevMode 警告: ハイドレーション不一致は next dev でのみ発生することがあるが、
      //    スタブ環境では再現しない。警告レベルのメッセージをスキップする。
      if (
        text.includes("Warning:") ||
        text.includes("react-dom") ||
        text.includes("Hydration")
      ) {
        return;
      }
      // 2. Next.js dev サーバーが Server 側ログをブラウザコンソールに転送する際の
      //    構造化ログ（logWidgetFetchError が出力する widget_data_fetch_error など）。
      //    これらは意図的なエラーログであり、予期しないアプリクラッシュではない。
      //    Next.js が "%c%s%c ... Server " 形式で console.error を呼ぶ。
      if (
        text.includes("widget_data_fetch_error") ||
        text.includes('"event":')
      ) {
        return;
      }
      consoleErrors.push(text);
    }
  });

  const user = await createTestUser("widget-error-isolation");
  const userIds = [user.id];

  try {
    await injectSessionCookie(context, user);

    // ─── (a) 正常なデータソース（PUBLIC、スタブが CSV を返す） ───
    const dsNormal = await createTestDataSource(
      user.id,
      "E2E 正常 DS",
      // デフォルト spreadsheetId = "stub-spreadsheet-id-e2e"（"-forbidden-" を含まない）
    );

    // ─── (b) FORBIDDEN データソース（PUBLIC、"-forbidden-" を含む spreadsheetId） ───
    const dsForbidden = await createTestDataSource(
      user.id,
      "E2E FORBIDDEN DS",
      {
        spreadsheetId: "stub-forbidden-spreadsheet-id-e2e",
        authMode: "PUBLIC",
      },
    );

    // ─── (c) REAUTH_REQUIRED データソース（OAUTH、期限切れアカウント） ───
    const dsReauth = await createTestDataSource(user.id, "E2E REAUTH DS", {
      spreadsheetId: "stub-reauth-spreadsheet-id-e2e",
      authMode: "OAUTH",
    });

    // REAUTH 用: 期限切れ access_token + e2e-reauth-invalid refresh_token の Account を作成する
    // oauthSheetClient.ts の resolveAccessToken がリフレッシュを試み、
    // スタブが 400 を返すことで REAUTH_REQUIRED エラーになる
    await createTestOAuthAccount(
      user.id,
      `${REAUTH_INVALID_REFRESH_TOKEN}-token`,
    );

    // ─── ダッシュボードと 3 ウィジェットを DB に直接作成する ───
    const dashboard = await createTestDashboard(
      user.id,
      "エラー分離テストダッシュボード",
    );

    await createTestWidget(dashboard.id, WIDGET_TITLE_NORMAL, dsNormal.id);
    await createTestWidget(
      dashboard.id,
      WIDGET_TITLE_FORBIDDEN,
      dsForbidden.id,
    );
    await createTestWidget(dashboard.id, WIDGET_TITLE_REAUTH, dsReauth.id);

    // ─── ページを開く ───
    await page.goto(`/dashboards/${dashboard.id}`, { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "エラー分離テストダッシュボード" }),
    ).toBeVisible({ timeout: 10_000 });

    // ─── (a) 正常ウィジェット: SVG グラフが表示される ───
    const normalCard = page
      .locator(".react-grid-item")
      .filter({ hasText: WIDGET_TITLE_NORMAL });
    await expect(normalCard).toBeVisible({ timeout: 15_000 });
    await expect(normalCard.locator("svg")).toBeVisible({ timeout: 15_000 });

    // ─── (b) FORBIDDEN ウィジェット: エラーメッセージが表示される ───
    const forbiddenCard = page
      .locator(".react-grid-item")
      .filter({ hasText: WIDGET_TITLE_FORBIDDEN });
    await expect(forbiddenCard).toBeVisible({ timeout: 15_000 });
    await expect(
      forbiddenCard.locator('[role="alert"][aria-label="データ取得エラー"]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      forbiddenCard.getByText("データの取得に失敗しました"),
    ).toBeVisible({ timeout: 5_000 });

    // ─── (c) REAUTH_REQUIRED ウィジェット: 再認可メッセージとリンクが表示される ───
    const reauthCard = page
      .locator(".react-grid-item")
      .filter({ hasText: WIDGET_TITLE_REAUTH });
    await expect(reauthCard).toBeVisible({ timeout: 15_000 });
    await expect(
      reauthCard.locator('[role="alert"][aria-label="再認可が必要"]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      reauthCard.getByText("アクセス権の再認可が必要です"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(reauthCard.locator('a[href="/datasources"]')).toBeVisible({
      timeout: 5_000,
    });

    // ─── ページ全体がクラッシュしていないこと ───
    expect(
      pageErrors,
      `未処理のページエラー: ${pageErrors.join(", ")}`,
    ).toHaveLength(0);
    expect(
      consoleErrors,
      `console.error が検出された: ${consoleErrors.join(", ")}`,
    ).toHaveLength(0);

    // ─── 偽陽性チェック: 正常カードに error role がないこと ───
    // FORBIDDEN / REAUTH のエラーが正常ウィジェットのカードに漏れていないこと
    await expect(normalCard.locator('[role="alert"]')).not.toBeVisible({
      timeout: 3_000,
    });
  } finally {
    await cleanupUsers(userIds);
  }
});

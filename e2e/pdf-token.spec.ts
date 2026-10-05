/**
 * FEAT-E2E-004: PDF トークンの有効性と単回使用
 *
 * PDF 出力で使われるトークンが仕様（§5 FR-5, §7, §7a）どおり単回使用であることを検証する。
 *
 * テスト方針:
 * - src/lib/pdf/pdfToken.ts は "server-only" のため import しない。
 * - e2e/support/pdfToken.ts が同等トークンを生成して DB に INSERT する。
 * - context.request.get で /dashboards/:id/print に HTTP リクエストを送り、
 *   x-pdf-token ヘッダーの有無・有効/無効でレスポンスを確認する。
 *
 * Next.js 15 ソフト 404 の注記:
 * `notFound()` はサーバーコンポーネントで呼ばれると `loading.tsx` のストリーミングにより
 * HTTP 200 を返す（ソフト 404）。さらに、成功したページの HTML にも not-found 境界の文言
 * （「ページが見つかりません」）が含まれることが実測で確認されている（Next.js App Router の仕様）。
 *
 * このため、テストの判定は「ページが見つかりません」の有無ではなく、
 * ダッシュボードのタイトルの有無に統一する:
 * - 有効トークンの 1 回目: HTTP 200 かつ HTML にタイトルが含まれる
 * - 無効なケース（2 回目・トークンなし・束縛不一致）: HTML にタイトルが含まれない
 *   （HTTP ステータスは 200 でも可）
 */

import { test, expect, type APIResponse } from "@playwright/test";
import {
  createTestUser,
  createTestDashboard,
  cleanupUsers,
} from "./support/db";
import {
  createTestPdfToken,
  cleanupPdfTokensByUserId,
} from "./support/pdfToken";

/**
 * 無効トークンレスポンスのアサート。
 * ソフト 404 のため HTTP ステータスは問わず、ダッシュボードコンテンツが
 * 含まれていないことを確認する。
 */
async function assertNotAuthorized(
  response: APIResponse,
  dashboardTitle: string,
): Promise<void> {
  const html = await response.text();
  // 正常なダッシュボードコンテンツが表示されていないこと
  expect(html).not.toContain(dashboardTitle);
}

test.describe("PDF token single-use — FEAT-E2E-004", () => {
  // ─── 正常系: 有効トークンの 1 回目アクセスは 200 かつダッシュボード内容を返す ───

  test("valid token allows first access to print page with dashboard content", async ({
    context,
  }) => {
    const user = await createTestUser("pdf-valid");
    const dashTitle = "PDF 有効トークンダッシュ";
    const dashboard = await createTestDashboard(user.id, dashTitle);
    const userIds = [user.id];

    try {
      const token = await createTestPdfToken(user.id, dashboard.id);

      const response = await context.request.get(
        `/dashboards/${dashboard.id}/print`,
        { headers: { "x-pdf-token": token } },
      );

      // 1 回目は 200 で HTML が返ること
      expect(response.status()).toBe(200);

      const html = await response.text();

      // ポジティブコントロール: HTML にダッシュボードタイトルが含まれること
      expect(html).toContain(dashTitle);
    } finally {
      await cleanupPdfTokensByUserId(userIds);
      await cleanupUsers(userIds);
    }
  });

  // ─── 正常系 + 単回使用: 同じトークンの 2 回目はタイトルを返さない ───
  // 1 回目が成功している（タイトルが含まれる）ことを確認してから、
  // 同じトークンで 2 回目を試みることで、単回使用の強制を検証する。

  test("same token on second access does not show dashboard content (single-use enforcement)", async ({
    context,
  }) => {
    const user = await createTestUser("pdf-reuse");
    const dashTitle = "PDF 再使用ダッシュ";
    const dashboard = await createTestDashboard(user.id, dashTitle);
    const userIds = [user.id];

    try {
      const token = await createTestPdfToken(user.id, dashboard.id);

      // 1 回目: 成功（ポジティブコントロール: ダッシュボードタイトルが含まれること）
      const firstResponse = await context.request.get(
        `/dashboards/${dashboard.id}/print`,
        { headers: { "x-pdf-token": token } },
      );
      expect(firstResponse.status()).toBe(200);
      const firstHtml = await firstResponse.text();
      expect(firstHtml).toContain(dashTitle);

      // 2 回目: 単回使用チェックによりダッシュボードコンテンツが返らないこと
      const secondResponse = await context.request.get(
        `/dashboards/${dashboard.id}/print`,
        { headers: { "x-pdf-token": token } },
      );
      await assertNotAuthorized(secondResponse, dashTitle);
    } finally {
      await cleanupPdfTokensByUserId(userIds);
      await cleanupUsers(userIds);
    }
  });

  // ─── 異常系: トークンなしはダッシュボードコンテンツを返さない ───

  test("request without token does not show dashboard content", async ({
    context,
  }) => {
    const user = await createTestUser("pdf-notoken");
    const dashTitle = "トークンなしダッシュ";
    const dashboard = await createTestDashboard(user.id, dashTitle);
    const userIds = [user.id];

    try {
      const response = await context.request.get(
        `/dashboards/${dashboard.id}/print`,
      );

      // トークンなしなのでダッシュボードコンテンツが表示されないこと
      await assertNotAuthorized(response, dashTitle);
    } finally {
      await cleanupPdfTokensByUserId(userIds);
      await cleanupUsers(userIds);
    }
  });

  // ─── 異常系: 他ユーザーのトークン（sub 束縛不一致）はダッシュボードコンテンツを返さない ───
  // ダッシュボードは userB のもの、トークンは userA の userId で発行 → ownerId != sub で拒否

  test("token bound to different user does not show dashboard content", async ({
    context,
  }) => {
    const userA = await createTestUser("pdf-user-a");
    const userB = await createTestUser("pdf-user-b");
    // ダッシュボードは userB が所有
    const dashTitle = "UserB ダッシュ";
    const dashboard = await createTestDashboard(userB.id, dashTitle);
    const userIds = [userA.id, userB.id];

    try {
      // トークンは userA.id を sub にして、dashboard.id を束縛
      // print/page.tsx: dashboard.ownerId (=userB.id) !== tokenPayload.sub (=userA.id) → notFound
      const token = await createTestPdfToken(userA.id, dashboard.id);

      const response = await context.request.get(
        `/dashboards/${dashboard.id}/print`,
        { headers: { "x-pdf-token": token } },
      );

      await assertNotAuthorized(response, dashTitle);
    } finally {
      await cleanupPdfTokensByUserId(userIds);
      await cleanupUsers(userIds);
    }
  });

  // ─── 境界値: 別ダッシュボードのトークン（dashboardId 束縛不一致）はダッシュボードコンテンツを返さない ───
  // トークンの dashboardId と URL の :id が異なる → notFound

  test("token bound to different dashboard does not show dashboard content", async ({
    context,
  }) => {
    const user = await createTestUser("pdf-wrong-dash");
    const dashA = await createTestDashboard(user.id, "ダッシュ A 固有");
    const dashB = await createTestDashboard(user.id, "ダッシュ B 固有");
    const userIds = [user.id];

    try {
      // dashA 用のトークンで dashB の print ページにアクセス
      // print/page.tsx: tokenPayload.dashboardId (=dashA.id) !== dashboardId (=dashB.id) → notFound
      const token = await createTestPdfToken(user.id, dashA.id);

      const response = await context.request.get(
        `/dashboards/${dashB.id}/print`,
        { headers: { "x-pdf-token": token } },
      );

      await assertNotAuthorized(response, "ダッシュ B 固有");
    } finally {
      await cleanupPdfTokensByUserId(userIds);
      await cleanupUsers(userIds);
    }
  });
});

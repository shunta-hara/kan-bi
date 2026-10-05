/**
 * FEAT-E2E-005: 所有権保護（他ユーザーのリソースへのアクセス拒否）
 *
 * ログイン済みのユーザー A が、ユーザー B のダッシュボード・データソースに
 * アクセスしようとしたとき、403 または 404 が返ることを検証する。
 *
 * Route Handler 側の所有権チェック (ownerId 照合) が正しく機能していることを確認する。
 * (architecture.md: 「所有権チェックは Route Handler / Server Action 側で必ず行う」)
 *
 * テスト構成:
 * - ネガティブテスト: A が B のリソースを拒否される（403/404）
 * - ポジティブコントロール: B が自分のリソースにアクセスできる（200/正常表示）
 *   → ポジコンがないと「全リソースが 403 を返すバグ」をテストが見逃す
 *
 * 注: アプリのデフォルトロケールは "ja"（日本語）のため、UI テキスト比較は
 * 日本語テキストで行う。
 * - en: "Page not found" / ja: "ページが見つかりません" (errors.notFoundTitle)
 */

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  createTestDashboard,
  createTestDataSource,
  cleanupUsers,
} from "./support/db";
import { injectSessionCookie } from "./support/session";

/** Not Found ページの見出しテキスト (ja デフォルトロケール) */
const NOT_FOUND_HEADING = "ページが見つかりません";

test.describe("Ownership protection — FEAT-E2E-005", () => {
  // ─── ネガティブテスト: A が B のリソースを拒否される ───

  test("user A cannot access user B dashboard page", async ({
    page,
    context,
  }) => {
    const userA = await createTestUser("owner-a-dash");
    const userB = await createTestUser("owner-b-dash");
    const dashboard = await createTestDashboard(userB.id, "B Dashboard");
    const userIds = [userA.id, userB.id];

    try {
      // ユーザー A のセッションを注入
      await injectSessionCookie(context, userA);

      // ユーザー B のダッシュボードに A のセッションでアクセス
      await page.goto(`/dashboards/${dashboard.id}`, {
        waitUntil: "domcontentloaded",
      });

      // 404 ページが表示されること
      await expect(
        page.getByRole("heading", { name: NOT_FOUND_HEADING }),
      ).toBeVisible({ timeout: 15_000 });

      // 正常なダッシュボード内容が表示されていないことを確認
      await expect(page.getByText("B Dashboard")).not.toBeVisible();
    } finally {
      await cleanupUsers(userIds);
    }
  });

  test("user A gets 404 when accessing user B PDF API", async ({ context }) => {
    const userA = await createTestUser("owner-a-pdf");
    const userB = await createTestUser("owner-b-pdf");
    const dashboard = await createTestDashboard(userB.id, "B PDF Dashboard");
    const userIds = [userA.id, userB.id];

    try {
      await injectSessionCookie(context, userA);

      // API リクエストで直接確認
      const response = await context.request.get(
        `/api/dashboards/${dashboard.id}/pdf`,
      );

      // 所有権チェックで 404 が返る
      expect([403, 404]).toContain(response.status());
    } finally {
      await cleanupUsers(userIds);
    }
  });

  test("user A gets 404 when accessing user B datasource API", async ({
    context,
  }) => {
    const userA = await createTestUser("owner-a-ds");
    const userB = await createTestUser("owner-b-ds");
    const dataSource = await createTestDataSource(userB.id, "B DataSource");
    const userIds = [userA.id, userB.id];

    try {
      await injectSessionCookie(context, userA);

      // GET /api/datasources/:id を A のセッションで呼ぶ
      const response = await context.request.get(
        `/api/datasources/${dataSource.id}`,
      );

      // 所有権チェックで 404 が返る
      expect([403, 404]).toContain(response.status());
    } finally {
      await cleanupUsers(userIds);
    }
  });

  // ─── 境界値: 存在しない ID へのアクセスも 404 ───

  test("accessing non-existent dashboard returns 404 via API", async ({
    context,
  }) => {
    const userA = await createTestUser("owner-a-nonexist");
    const userIds = [userA.id];

    try {
      await injectSessionCookie(context, userA);

      const response = await context.request.get(
        "/api/dashboards/nonexistent-dashboard-id-xyz",
      );

      expect([403, 404]).toContain(response.status());
    } finally {
      await cleanupUsers(userIds);
    }
  });

  // ─── 異常系: 未認証でダッシュボード API にアクセスすると 401 ───

  test("unauthenticated request to dashboard API returns 401", async ({
    context,
  }) => {
    const userB = await createTestUser("owner-b-unauth");
    const dashboard = await createTestDashboard(userB.id, "B Unauth Dashboard");
    const userIds = [userB.id];

    try {
      // Cookie を注入しない (未認証)
      const response = await context.request.get(
        `/api/dashboards/${dashboard.id}`,
      );

      expect(response.status()).toBe(401);
    } finally {
      await cleanupUsers(userIds);
    }
  });

  // ─── ポジティブコントロール: B が自分のリソースにアクセスできる ───
  // アプリ全体が全 403 を返すバグがあっても現在のネガティブテストはパスしてしまうため、
  // 所有者本人がアクセスできることを確認するポジティブコントロールを追加する。

  test("user B can access their own dashboard page", async ({
    page,
    context,
  }) => {
    const userB = await createTestUser("owner-b-self");
    const dashboard = await createTestDashboard(userB.id, "B Own Dashboard");
    const userIds = [userB.id];

    try {
      await injectSessionCookie(context, userB);
      await page.goto(`/dashboards/${dashboard.id}`, {
        waitUntil: "domcontentloaded",
      });

      // /login にリダイレクトされない（認証済みとして扱われる）
      await expect(page).not.toHaveURL(/\/login/);
      // 404 ページが表示されない（所有権チェック通過）
      await expect(
        page.getByRole("heading", { name: NOT_FOUND_HEADING }),
      ).not.toBeVisible({ timeout: 10_000 });
      // ダッシュボード本体が実際に描画されている（白紙・無限ロードでは通らない）
      await expect(
        page.getByRole("heading", { name: "B Own Dashboard" }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupUsers(userIds);
    }
  });

  test("user B can access their own datasource via API", async ({
    context,
  }) => {
    const userB = await createTestUser("owner-b-self-ds");
    const dataSource = await createTestDataSource(userB.id, "B Own DataSource");
    const userIds = [userB.id];

    try {
      await injectSessionCookie(context, userB);

      // B 自身のデータソース API は 200 を返す
      const response = await context.request.get(
        `/api/datasources/${dataSource.id}`,
      );

      expect(response.status()).toBe(200);

      const body = (await response.json()) as { data: { id: string } };
      expect(body.data.id).toBe(dataSource.id);
    } finally {
      await cleanupUsers(userIds);
    }
  });
});

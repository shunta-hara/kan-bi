/**
 * FEAT-E2E-006: ウィジェット連続追加（リグレッションテスト）
 *
 * FEAT-BF-004 で修正された「2 回目以降のウィジェット追加ができないバグ」の
 * リグレッションを防止する。3 回連続でウィジェットを追加し、
 * 各回でダイアログが空フォームで開くこと・追加が正常に完了することを検証する。
 *
 * FEAT-BF-004 の修正方法: AddWidgetDialog を key={dialogKey} でリマウントする。
 * これにより useActionState が毎回初期状態にリセットされ、前回の成功・失敗状態が残らない。
 */

import { test, expect } from "@playwright/test";

import {
  createTestUser,
  createTestDashboard,
  createTestDataSource,
  cleanupUsers,
  prismaE2e,
} from "./support/db";
import { injectSessionCookie } from "./support/session";
import { clickUntilVisible } from "./support/ui";

const DASHBOARD_TITLE = "ウィジェット連続追加テスト";
const DS_NAME = "E2E 連続追加テスト DS";
const WIDGET_TITLES = [
  "ウィジェット一",
  "ウィジェット二",
  "ウィジェット三",
] as const;

test("3 回連続でウィジェットを追加でき、各回ダイアログが空フォームで開く", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);

  const user = await createTestUser("widget-consecutive");
  const userIds = [user.id];
  try {
    await injectSessionCookie(context, user);

    // DB にダッシュボードとデータソースを直接作成する
    await createTestDataSource(user.id, DS_NAME);
    const dashboard = await createTestDashboard(user.id, DASHBOARD_TITLE);

    await page.goto(`/dashboards/${dashboard.id}`, { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: DASHBOARD_TITLE }),
    ).toBeVisible({ timeout: 10_000 });

    // 3 回連続でウィジェットを追加する
    for (const widgetTitle of WIDGET_TITLES) {
      // ─── ダイアログを開く ───
      await clickUntilVisible(
        page.getByRole("button", { name: "ウィジェットを追加" }),
        page.getByRole("heading", { name: "ウィジェットを追加" }),
      );

      // ─── 空フォームであることを確認（FEAT-BF-004 リグレッション検証）───
      // 2 回目以降でも前回の入力値・成功状態が残っていないことを検証する
      const titleInput = page.getByLabel("タイトル（任意）");
      await expect(titleInput).toHaveValue("", { timeout: 5_000 });

      // ─── フォームを入力して追加する ───
      await titleInput.fill(widgetTitle);
      await page.getByLabel("データソース").selectOption({ label: DS_NAME });

      // 「追加する」ボタンが有効になるまで待ってからクリック
      await expect(page.getByRole("button", { name: "追加する" })).toBeEnabled({
        timeout: 5_000,
      });
      await page.getByRole("button", { name: "追加する" }).click();

      // ─── ダイアログが閉じてウィジェットが表示される ───
      await expect(
        page.getByRole("heading", { name: "ウィジェットを追加" }),
      ).not.toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(widgetTitle, { exact: false })).toBeVisible({
        timeout: 15_000,
      });
    }

    // ─── 画面上に 3 件のウィジェットが表示されていること ───
    await expect(page.locator(".react-grid-item")).toHaveCount(3, {
      timeout: 10_000,
    });

    // ─── DB 上に 3 件のウィジェットが存在すること ───
    const dbWidgets = await prismaE2e.widget.findMany({
      where: { dashboardId: dashboard.id },
    });
    expect(dbWidgets).toHaveLength(3);

    // 全ウィジェットのタイトルが正しいこと
    const dbTitles = dbWidgets.map((w) => w.title).sort();
    const expectedTitles = [...WIDGET_TITLES].sort();
    expect(dbTitles).toEqual(expectedTitles);
  } finally {
    await cleanupUsers(userIds);
  }
});

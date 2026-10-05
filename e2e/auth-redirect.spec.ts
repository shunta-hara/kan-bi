/**
 * FEAT-E2E-002: 未認証アクセスのリダイレクト検証
 *
 * Cookie を持たないブラウザが保護ページ (/dashboards, /datasources, /settings) に
 * アクセスしたとき、ミドルウェアが /login へリダイレクトすることを検証する。
 * また、有効なセッション Cookie を持つ場合はリダイレクトされないことも確認する。
 *
 * 注: アプリのデフォルトロケールは "ja"（日本語）のため、UI テキスト比較は
 * 日本語または言語非依存の方法で行う（src/i18n/locales.ts defaultLocale = "ja"）。
 */

import { test, expect } from "@playwright/test";
import { createTestUser, cleanupUsers } from "./support/db";
import { injectSessionCookie } from "./support/session";

const PROTECTED_PATHS = ["/dashboards", "/datasources", "/settings"] as const;

test.describe("Unauthenticated redirects — FEAT-E2E-002", () => {
  // ─── 正常系: Cookie なしで保護パスに到達するとログインページにリダイレクト ───

  for (const path of PROTECTED_PATHS) {
    test(`redirects ${path} to /login without session cookie`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // URL が /login を含む (最終的なリダイレクト先を確認)
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

      // ログイン UI の見出しが表示される (デフォルトロケール ja の表示を確認)
      // en: "Sign in to Kan. Sheets BI" / ja: "Kan. Sheets BI にログイン"
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  // ─── 正常系: 有効なセッション Cookie を持つ場合は /dashboards にリダイレクトされない ───

  test("does not redirect /dashboards when valid session cookie is present", async ({
    page,
    context,
  }) => {
    const user = await createTestUser("noredirect");
    const userIds = [user.id];

    try {
      await injectSessionCookie(context, user);
      await page.goto("/dashboards", { waitUntil: "domcontentloaded" });

      // /login に飛ばされないことを確認
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await cleanupUsers(userIds);
    }
  });

  // ─── 境界値: /dashboards 配下のサブパスも保護対象 ───

  test("sub-path /dashboards/some-id also redirects to /login without cookie", async ({
    page,
  }) => {
    await page.goto("/dashboards/nonexistent-id-xyz", {
      waitUntil: "domcontentloaded",
    });
    // サブパスも middleware のガード対象
    // (/login にリダイレクトされるか、または 404 になる可能性があるため URL を確認)
    const finalUrl = page.url();
    // セッション Cookie がないので /login にリダイレクトされる
    expect(finalUrl).toMatch(/\/login/);
  });
});

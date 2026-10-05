/**
 * FEAT-E2E-003: 主要フロー
 *
 * ログイン（セッション注入）→ ダッシュボード作成 → データソース登録（固定 CSV プレビュー確認）
 * → ウィジェット作成 → レイアウト変更（自動保存）→ リロード後の状態確認 → PDF ダウンロード
 *
 * 各ステップは test.step で分割する。
 *
 * タイムアウト注記:
 * このテストはデータソース登録・ウィジェット作成・PDF 生成など多くのサーバー処理を含み、
 * 特に PDF 生成（Playwright による Chromium 起動 + ページレンダリング）に最大 30 秒程度かかる。
 * そのため test.setTimeout(120_000) で 30 秒の制限を延ばしている。
 *
 * 注: PDF ダウンロードステップには E2E_SERVER_BROWSERS_PATH（または標準の Playwright
 * ブラウザインストール）が必要。未設定の環境では PDF 生成が失敗することがある。
 */

import path from "node:path";
import { createReadStream } from "node:fs";

import { test, expect } from "@playwright/test";
import { createTestUser, cleanupUsers, prismaE2e } from "./support/db";
import { injectSessionCookie } from "./support/session";

/** 固定 CSV のスタブ用 URL（fetch-stub.mjs が docs.google.com に固定データを返す） */
const DS_URL =
  "https://docs.google.com/spreadsheets/d/stub-spreadsheet-id-e2e/edit";
const DS_RANGE = "Sheet1";
const DS_NAME = "E2E テストデータソース";
const DASHBOARD_TITLE = "E2E メインフローダッシュボード";
const WIDGET_TITLE = "テストウィジェット";

test("main flow: login → dashboard → datasource → widget → layout → PDF", async ({
  page,
  context,
}) => {
  /**
   * このテストは PDF 生成を含む長いシナリオのため 120 秒に延長する。
   * PDF 生成: Playwright が /dashboards/:id/print を Chromium でレンダリングするため
   * サーバー起動から最大 30 秒かかる可能性がある（仕様 §13 の 15 秒タイムアウト込み）。
   */
  test.setTimeout(120_000);

  const user = await createTestUser("main-flow");
  const userIds = [user.id];

  try {
    await injectSessionCookie(context, user);

    // ─── Step 1: /dashboards を開いてダッシュボード一覧が表示される ───
    await test.step("ダッシュボード一覧が表示される", async () => {
      await page.goto("/dashboards", { waitUntil: "domcontentloaded" });
      // ログインリダイレクトがないこと
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
      // 一覧ページの見出し（exact: true で "まだダッシュボードがありません" との部分一致を避ける）
      await expect(
        page.getByRole("heading", { name: "ダッシュボード", exact: true }),
      ).toBeVisible({ timeout: 10_000 });
    });

    // ─── Step 2: ダッシュボードを作成して編集画面に遷移する ───
    let dashboardId: string;
    await test.step("ダッシュボードを作成する", async () => {
      await page.getByRole("button", { name: "新規作成" }).click();
      await expect(
        page.getByRole("heading", { name: "新しいダッシュボードを作成" }),
      ).toBeVisible({ timeout: 5_000 });

      await page.getByLabel("タイトル").fill(DASHBOARD_TITLE);
      await page.getByRole("button", { name: "作成する" }).click();

      // Server Action の redirect() でダッシュボード詳細ページへ遷移する
      await page.waitForURL(/\/dashboards\/[^/]+$/, { timeout: 15_000 });
      dashboardId = page.url().split("/").pop()!;
      expect(dashboardId).toBeTruthy();

      // 詳細ページのタイトルが表示されること
      await expect(
        page.getByRole("heading", { name: DASHBOARD_TITLE }),
      ).toBeVisible({ timeout: 10_000 });
    });

    // ─── Step 3: データソースを登録してプレビューが表示される ───
    await test.step("データソースを登録する（固定 CSV プレビュー確認）", async () => {
      // waitUntil: "load" で JS 初期化を待つ（React hydration が完了し onChange が動作するため）
      await page.goto("/datasources", { waitUntil: "load" });
      await expect(
        page.getByRole("heading", { name: "データソース", exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // フォームを入力する
      await page.getByLabel("名前").fill(DS_NAME);
      await page.getByLabel("スプレッドシートの URL または ID").fill(DS_URL);
      await page.getByLabel("読み込み範囲").fill(DS_RANGE);
      // 取得方式: 公開シート（デフォルト）はそのまま

      // プレビューを取得する
      await page.getByRole("button", { name: "プレビューを取得" }).click();

      // 固定 CSV のプレビュー（"プレビュー" 見出し + "Name" 列）が表示されること
      await expect(
        page.getByRole("heading", { name: "プレビュー" }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("columnheader", { name: "Name" }).first(),
      ).toBeVisible({ timeout: 5_000 });

      // データソースを登録する
      await page
        .getByRole("button", { name: "このデータソースを登録" })
        .click();

      // 成功メッセージが表示されること
      await expect(page.getByText(`「${DS_NAME}」を登録しました`)).toBeVisible({
        timeout: 15_000,
      });
    });

    // ─── Step 4: ウィジェットを追加してグリッドに表示される ───
    await test.step("ウィジェットを追加する", async () => {
      await page.goto(`/dashboards/${dashboardId}`, {
        waitUntil: "load",
      });
      await expect(
        page.getByRole("heading", { name: DASHBOARD_TITLE }),
      ).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "ウィジェットを追加" }).click();
      await expect(
        page.getByRole("heading", { name: "ウィジェットを追加" }),
      ).toBeVisible({ timeout: 10_000 });

      // タイトルとデータソースを設定する
      await page.getByLabel("タイトル（任意）").fill(WIDGET_TITLE);
      await page.getByLabel("データソース").selectOption({ label: DS_NAME });

      await page.getByRole("button", { name: "追加する" }).click();

      // ダイアログが閉じてウィジェットが表示されること
      await expect(
        page.getByRole("heading", { name: "ウィジェットを追加" }),
      ).not.toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(WIDGET_TITLE)).toBeVisible({
        timeout: 15_000,
      });
    });

    // ─── Step 5: 編集モードでドラッグし、レイアウトが自動保存される ───
    await test.step("レイアウトを変更して自動保存を確認する", async () => {
      // 編集モードに切替
      await page.getByRole("button", { name: "編集モード" }).click();
      await expect(
        page.getByRole("button", { name: "閲覧モード" }),
      ).toBeVisible({ timeout: 5_000 });

      // PUT layout レスポンスを事前にリッスンする（ドラッグ前に登録しておく）
      const layoutResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/dashboards/${dashboardId}/layout`) &&
          resp.request().method() === "PUT",
        { timeout: 15_000 },
      );

      // .drag-handle の位置を取得して段階的にドラッグする
      const handle = page.locator(".drag-handle").first();
      await handle.waitFor({ state: "visible" });
      const box = await handle.boundingBox();
      if (!box)
        throw new Error("drag-handle の bounding box を取得できませんでした");

      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const moveDistance = 200; // 200px 下へ移動

      // マウスをハンドル中心に移動 → ボタン押下 → 段階的移動 → ボタン解放
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let step = 1; step <= 10; step++) {
        await page.mouse.move(cx, cy + (moveDistance / 10) * step, {
          steps: 2,
        });
      }
      await page.mouse.move(cx, cy + moveDistance);
      await page.mouse.up();

      // デバウンス後に PUT layout が 200 で返ること（SAVE_DEBOUNCE_MS = 800ms）
      const layoutResponse = await layoutResponsePromise;
      expect(layoutResponse.status()).toBe(200);
    });

    // ─── Step 6: リロード後もウィジェットが同じ位置・サイズで表示される ───
    await test.step("リロード後もウィジェットが保持されている", async () => {
      // waitUntil: "load" で JS が読み込まれるのを待つ（次 step の PDF ボタンが React を必要とするため）
      await page.reload({ waitUntil: "load" });

      // ウィジェットが引き続き表示されること
      await expect(page.getByText(WIDGET_TITLE)).toBeVisible({
        timeout: 15_000,
      });

      // DB のレイアウトが保存済みであること（空オブジェクト "{}" でない）
      const dbDashboard = await prismaE2e.dashboard.findUnique({
        where: { id: dashboardId },
        select: { layouts: true },
      });
      expect(dbDashboard).not.toBeNull();
      const layouts = dbDashboard!.layouts as Record<string, unknown[]>;
      const hasLayouts = Object.values(layouts).some(
        (arr) => Array.isArray(arr) && arr.length > 0,
      );
      expect(hasLayouts).toBe(true);
    });

    // ─── Step 7: PDF ダウンロードし、先頭が %PDF のバイナリを確認する ───
    await test.step("PDF をダウンロードして有効な PDF ファイルを確認する", async () => {
      // PDF 出力ボタンをクリックしてダイアログを開く
      await page.getByRole("button", { name: "PDF 出力" }).click();
      await expect(
        page.getByRole("dialog", { name: "PDF 出力オプション" }),
      ).toBeVisible({ timeout: 10_000 });

      // PDF API レスポンスと download イベントを同時に待つ。
      // ダウンロードボタンクリックより先にリスナーを登録しておく（Promise.all の先頭要素から順に評価）。
      // 注: blob: URL からの download イベントでは suggestedFilename() が "download" を返す場合が
      // あるため、ファイル名の確認は PDF API の Content-Disposition ヘッダーで行う。
      const [download, pdfResponse] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.waitForResponse(
          (resp) =>
            resp.url().includes("/pdf") &&
            resp.request().method() === "GET" &&
            resp.status() === 200,
          { timeout: 60_000 },
        ),
        page.getByRole("button", { name: "ダウンロード" }).click(),
      ]);

      // Content-Disposition ヘッダーにファイル名（.pdf）が含まれること（PR #5 回帰テスト）
      const disposition = pdfResponse.headers()["content-disposition"] ?? "";
      expect(disposition).toMatch(/\.pdf/i);

      // 先頭バイトが %PDF（有効な PDF）であること、かつ十分なサイズ（1KB 以上）
      const downloadPath = await download.path();
      if (!downloadPath)
        throw new Error("ダウンロードパスが取得できませんでした");

      const content = await readFileAsBuffer(downloadPath);
      expect(content.length).toBeGreaterThan(1024);
      expect(content.slice(0, 4).toString("ascii")).toBe("%PDF");
    });
  } finally {
    await cleanupUsers(userIds);
  }
});

/**
 * ダウンロード済みファイルを Buffer として読み込む。
 */
async function readFileAsBuffer(filePath: string): Promise<Buffer> {
  const stream = createReadStream(path.resolve(filePath));
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

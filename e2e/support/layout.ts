/**
 * ダッシュボードのレイアウト操作ヘルパー（FEAT-E2E-003）。
 *
 * レイアウトは編集モードでのドラッグ／リサイズ後にデバウンス保存される
 * （`PUT /api/dashboards/:id/layout`）。保存リクエストの本文を読んで、操作が実際にレイアウトを
 * 変えたことを検証できるようにする。
 *
 * 注意: レイアウトに変化が無くても、ブレークポイントの補完などで PUT が送られることがある。
 * 「PUT が 200 で返った」だけでは操作が効いた証明にならないため、本文の中身を検証すること。
 */

import { expect, type Locator, type Page } from "@playwright/test";

export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutPutBody = { layouts: Record<string, LayoutItem[]> };

/** 要素の中心から (dx, dy) だけ、マウスで段階的にドラッグする。 */
export async function dragBy(
  page: Page,
  target: Locator,
  dx: number,
  dy: number,
): Promise<void> {
  await target.waitFor({ state: "visible" });
  const box = await target.boundingBox();
  if (!box) throw new Error("ドラッグ対象の bounding box を取得できませんでした");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const steps = 10;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(
      startX + (dx / steps) * step,
      startY + (dy / steps) * step,
      { steps: 2 },
    );
  }
  await page.mouse.up();
}

/**
 * 次に発生するレイアウト保存（PUT /api/dashboards/:id/layout）の成功応答を待ち、
 * 送信されたレイアウトを返す。操作の「前」に呼んで Promise を保持し、操作後に await する。
 */
export async function waitForLayoutSave(
  page: Page,
  dashboardId: string,
): Promise<LayoutPutBody> {
  const response = await page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/dashboards/${dashboardId}/layout`) &&
      resp.request().method() === "PUT",
    { timeout: 15_000 },
  );
  expect(response.status()).toBe(200);
  return JSON.parse(response.request().postData() ?? "{}") as LayoutPutBody;
}

/** いずれかのブレークポイントのレイアウト項目が条件を満たすか。 */
export function someLayoutItem(
  body: LayoutPutBody,
  predicate: (item: LayoutItem) => boolean,
): boolean {
  return Object.values(body.layouts).some((items) => items.some(predicate));
}

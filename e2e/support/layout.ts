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
  if (!box)
    throw new Error("ドラッグ対象の bounding box を取得できませんでした");

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
 * 条件（`matches`）を満たす本文のレイアウト保存（PUT /api/dashboards/:id/layout）が成功するのを待ち、
 * その本文を返す。操作の「前」に呼んで Promise を保持し、操作後に await する。
 *
 * `description` は、条件を満たす保存が来なかったときのエラーに添える説明（例: 「幅が縮んだレイアウト」）。
 * 条件を満たさない PUT は読み飛ばす。グリッドは初回の操作の前後に、レイアウトを変えない保存
 * （ブレークポイントの補完など）を送ることがあり、それを「操作の結果」と取り違えると、
 * 環境が遅いときだけ失敗する不安定なテストになる（実際に master で発生した）。
 */
export async function waitForLayoutSave(
  page: Page,
  dashboardId: string,
  description: string,
  matches: (body: LayoutPutBody) => boolean,
): Promise<LayoutPutBody> {
  const response = await page
    .waitForResponse(
      (resp) => {
        if (
          !resp.url().includes(`/api/dashboards/${dashboardId}/layout`) ||
          resp.request().method() !== "PUT"
        ) {
          return false;
        }
        try {
          return matches(
            JSON.parse(resp.request().postData() ?? "{}") as LayoutPutBody,
          );
        } catch {
          return false;
        }
      },
      { timeout: 20_000 },
    )
    .catch((error: unknown) => {
      // 汎用のタイムアウトでは「操作が効かなかった」のか「保存が来なかった」のか分からないため、
      // 期待した条件を添えて投げ直す。
      throw new Error(`期待したレイアウト保存が来なかった: ${description}`, {
        cause: error,
      });
    });
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

export type Box = { x: number; y: number; width: number; height: number };

/**
 * 位置・サイズが安定するまで待ってから、要素の bounding box を返す。
 *
 * react-grid-layout のカードは、初期表示・リロード・レイアウト変更のたびに位置とサイズが
 * CSS トランジションでアニメーションする。アニメーション中に測ると値が毎回ばらつくため
 * （リロード直後の x が 389〜485px でばらつくことを実測）、連続した 2 回の測定が一致するまで待つ。
 */
export async function stableBoundingBox(
  target: Locator,
  timeout = 5_000,
): Promise<Box> {
  let previous: Box | null = null;
  await expect
    .poll(
      async () => {
        const current = await target.boundingBox();
        const isStable =
          previous !== null &&
          current !== null &&
          previous.x === current.x &&
          previous.y === current.y &&
          previous.width === current.width &&
          previous.height === current.height;
        previous = current;
        return isStable;
      },
      { timeout, intervals: [150] },
    )
    .toBe(true);
  return previous as unknown as Box;
}

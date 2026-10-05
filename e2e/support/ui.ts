/**
 * ハイドレーション待ちの UI 操作ヘルパー（FEAT-E2E-003）。
 *
 * Next.js ではページの読み込みが完了しても、React のハイドレーションが済むまでは
 * クリックや入力のイベントハンドラが付いておらず、操作が無視される。`waitUntil` の指定だけでは
 * ハイドレーション完了を保証できないため、「期待する結果が現れるまで操作を再試行する」。
 */

import { expect, type Locator } from "@playwright/test";

/**
 * `trigger` をクリックして `expected` を表示させる。ハイドレーション前のクリックで反応が無ければ再試行する。
 * すでに `expected` が表示されていれば何もしない（重複クリックでトグルが戻るのを防ぐ）。
 */
export async function clickUntilVisible(
  trigger: Locator,
  expected: Locator,
  timeout = 20_000,
): Promise<void> {
  await expect(async () => {
    if (await expected.isVisible()) return;
    await trigger.click({ timeout: 3_000 });
    await expect(expected).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout });
}

/**
 * `fillAll` を実行し、`gate`（入力が反映されると有効になるボタンなど）が有効になるまで再試行する。
 * ハイドレーション前の入力は React の状態に反映されないため、`gate` が有効にならない。
 */
export async function fillUntilEnabled(
  fillAll: () => Promise<void>,
  gate: Locator,
  timeout = 20_000,
): Promise<void> {
  await expect(async () => {
    await fillAll();
    await expect(gate).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout });
}

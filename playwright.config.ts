/**
 * Playwright E2E テスト設定
 *
 * 起動方式: next dev (next start ではない)
 * - next start は事前 next build が必要で E2E 実行が遅くなるため不採用
 * - next dev では --import フックが Node.js 起動時に適用されるため
 *   fetch スタブが Route Handler の評価前に有効になる
 * - Next.js が fetch をラップしても、ラップ対象が既にスタブ済みのため
 *   Google URL への呼び出しはスタブを通る
 *
 * 環境変数:
 * - e2e/run.mjs が .env.e2e を読み込んで process.env にセットしてから
 *   playwright test を呼ぶため、ここでは process.env を参照するだけでよい
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";

/** Chromium 実行ファイルのパス (プリインストール済み) */
const CHROMIUM_EXECUTABLE =
  process.env.E2E_CHROMIUM_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** フェッチスタブモジュールの絶対 file:// URL */
const fetchStubUrl = `file://${path.join(process.cwd(), "e2e/support/fetch-stub.mjs")}`;

/** E2E アプリの起動ポート (.env.e2e の AUTH_URL から取得) */
const appUrl = process.env.AUTH_URL ?? "http://localhost:3001";

export default defineConfig({
  /** テストファイルのディレクトリ */
  testDir: "./e2e",

  /** 各テストのタイムアウト (ms) */
  timeout: 30_000,

  /**
   * workers=1 (直列実行) で DB 競合を防ぐ。
   * fullyParallel=false と併用して確実に 1 ワーカーで動かす。
   */
  fullyParallel: false,
  workers: 1,

  /** CI 未整備のため retries なし */
  retries: 0,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: appUrl,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /** プリインストール済み Chromium を使用 (playwright install は不要) */
        launchOptions: {
          executablePath: CHROMIUM_EXECUTABLE,
        },
      },
    },
  ],

  /**
   * webServer: E2E テスト実行前にアプリを起動し、テスト終了後に停止する。
   *
   * NODE_OPTIONS で fetch-stub.mjs を --import してサーバー側 fetch をスタブする。
   * PORT で 3001 番ポートにバインドする。
   * AUTH_TRUST_HOST=true で localhost からの Auth.js リクエストを許可する。
   */
  webServer: {
    command: [
      `NODE_OPTIONS="--import ${fetchStubUrl}"`,
      `PORT=3001`,
      `AUTH_TRUST_HOST=true`,
      "next dev",
    ].join(" "),
    url: appUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    /** webServer も process.env (= .env.e2e を読み込んだ後の環境) を継承する */
    env: {
      ...process.env,
      NODE_ENV: "development",
    } as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
  },
});

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

/**
 * Chromium 実行ファイルのパス（任意）。
 * 未設定なら Playwright 標準のブラウザ（`pnpm exec playwright install chromium`）を使う。
 * プリインストール済みの Chromium を使う環境では .env.e2e で E2E_CHROMIUM_PATH を指定する。
 */
const chromiumExecutable = process.env.E2E_CHROMIUM_PATH;

/** フェッチスタブモジュールの絶対 file:// URL */
const fetchStubUrl = `file://${path.join(process.cwd(), "e2e/support/fetch-stub.mjs")}`;

/** E2E アプリの起動ポート (.env.e2e の AUTH_URL から取得) */
const appUrl = process.env.AUTH_URL ?? "http://localhost:3001";

/** アプリの待受ポート（AUTH_URL から導出し、起動待ちの URL とずらさない） */
const appPort = new URL(appUrl).port || "3001";

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
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /** E2E_CHROMIUM_PATH 指定時のみ、プリインストール済み Chromium を使用 */
        launchOptions: chromiumExecutable
          ? { executablePath: chromiumExecutable }
          : {},
      },
    },
  ],

  /**
   * webServer: E2E テスト実行前にアプリを起動し、テスト終了後に停止する。
   *
   * - NODE_OPTIONS で fetch-stub.mjs を --import してサーバー側 fetch をスタブする。
   * - PORT は AUTH_URL から導出する。
   * - AUTH_TRUST_HOST=true で localhost からの Auth.js リクエストを許可する。
   * - 環境変数は webServer.env で渡す（シェルの `VAR=value cmd` 構文は Windows で動かないため）。
   */
  webServer: {
    command: "pnpm exec next dev",
    url: appUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    /** process.env (= .env.e2e を読み込んだ後の環境) を継承し、E2E 用の値で上書きする */
    env: {
      ...process.env,
      NODE_ENV: "development",
      NODE_OPTIONS: `--import ${fetchStubUrl}`,
      PORT: appPort,
      AUTH_TRUST_HOST: "true",
    } as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
  },
});

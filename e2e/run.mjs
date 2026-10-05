/**
 * E2E テスト実行スクリプト
 *
 * 役割:
 * 1. .env.e2e を読み込んで process.env にセット
 * 2. E2E 専用 DB にマイグレーションを適用
 * 3. Playwright テストを実行 (playwright.config.ts が webServer を管理)
 *
 * 使用方法:
 *   pnpm e2e
 * (package.json scripts.e2e = "node e2e/run.mjs")
 */

import { spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const envFile = resolve(rootDir, ".env.e2e");

// ─── .env.e2e の読み込み ───

if (!existsSync(envFile)) {
  console.error(
    "Error: .env.e2e not found.\n" +
      "Copy .env.e2e.example and fill in the values:\n" +
      "  cp .env.e2e.example .env.e2e",
  );
  process.exit(1);
}

const envContent = readFileSync(envFile, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // 既存の process.env を上書き (E2E 設定を優先)
    process.env[key] = value;
  }
}

// ─── 接続先ガード ───
// migrate とテスト（ユーザーの作成・削除）は DATABASE_URL の DB に対して実行される。
// 開発・本番 DB を誤って指していた場合の事故を防ぐため、E2E 専用 DB 以外では中止する。

const databaseUrl = process.env.DATABASE_URL ?? "";
let databaseName = "";
try {
  databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
} catch {
  // パース不能な値は下の判定で中止する
}
if (!databaseName.toLowerCase().includes("e2e")) {
  console.error(
    `Error: DATABASE_URL must point to an E2E-only database (name containing "e2e"), got "${databaseName || "(unparsable)"}".\n` +
      "Refusing to run migrations and tests against it.",
  );
  process.exit(1);
}

// ─── E2E DB マイグレーション ───

console.log("[e2e] Applying E2E DB migrations...");
const migrateResult = spawnSync(
  "pnpm",
  ["exec", "prisma", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: process.env,
    cwd: rootDir,
  },
);

if (migrateResult.status !== 0) {
  console.error("[e2e] Migration failed. Aborting.");
  process.exit(migrateResult.status ?? 1);
}

// ─── Playwright テスト実行 ───

console.log("[e2e] Running Playwright tests...");
const testResult = spawnSync("pnpm", ["exec", "playwright", "test"], {
  stdio: "inherit",
  env: process.env,
  cwd: rootDir,
});

process.exit(testResult.status ?? 0);

/**
 * E2E テスト用 DB ヘルパー (FEAT-E2E-001)。
 *
 * E2E 専用 DB (DATABASE_URL が .env.e2e で指定) に直接 PrismaClient で
 * 接続し、テストデータの投入・後始末を行う。
 *
 * - src/lib/db/prisma.ts は import しない (server-only / グローバルキャッシュの影響を避ける)
 * - テスト間のデータ漏洩を防ぐため、各テストの afterEach で必ず cleanupUsers を呼ぶ
 * - User の削除は Cascade で Dashboard / DataSource も削除する (schema.prisma 参照)
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** E2E 専用 PrismaClient を生成する */
function createE2ePrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Ensure .env.e2e is loaded before using the E2E database.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** E2E テスト専用の PrismaClient インスタンス */
export const prismaE2e = createE2ePrisma();

// ─────────────────────────────────────────────
// テストデータ型
// ─────────────────────────────────────────────

export type E2eUser = {
  id: string;
  email: string;
  name: string | null;
};

export type E2eDashboard = {
  id: string;
  ownerId: string;
};

export type E2eDataSource = {
  id: string;
  ownerId: string;
};

// ─────────────────────────────────────────────
// ユーザー操作
// ─────────────────────────────────────────────

/**
 * E2E テスト用ユーザーを DB に作成する。
 * メールアドレスにタイムスタンプを含めてテスト間の衝突を防ぐ。
 */
export async function createTestUser(suffix: string): Promise<E2eUser> {
  const ts = Date.now();
  const email = `e2e-${suffix}-${ts}@example.com`;
  const user = await prismaE2e.user.create({
    data: { email, name: `E2E ${suffix}` },
    select: { id: true, email: true, name: true },
  });
  return user;
}

/**
 * 指定 ID のユーザーを削除する (Cascade で関連リソースも削除される)。
 */
export async function deleteUser(userId: string): Promise<void> {
  await prismaE2e.user.deleteMany({ where: { id: userId } });
}

/**
 * 複数ユーザーを一括削除する。
 * テストの afterEach / afterAll で呼ぶことでデータ漏洩を防ぐ。
 */
export async function cleanupUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prismaE2e.user.deleteMany({ where: { id: { in: userIds } } });
}

// ─────────────────────────────────────────────
// ダッシュボード操作
// ─────────────────────────────────────────────

/**
 * 指定ユーザーのダッシュボードを DB に作成する。
 */
export async function createTestDashboard(
  ownerId: string,
  title = "E2E Dashboard",
): Promise<E2eDashboard> {
  const dashboard = await prismaE2e.dashboard.create({
    data: { ownerId, title, layouts: {} },
    select: { id: true, ownerId: true },
  });
  return dashboard;
}

// ─────────────────────────────────────────────
// データソース操作
// ─────────────────────────────────────────────

/**
 * 指定ユーザーのデータソースを DB に作成する。
 */
export async function createTestDataSource(
  ownerId: string,
  name = "E2E DataSource",
): Promise<E2eDataSource> {
  const ds = await prismaE2e.dataSource.create({
    data: {
      ownerId,
      name,
      spreadsheetId: "stub-spreadsheet-id-e2e",
      range: "Sheet1",
      authMode: "PUBLIC",
    },
    select: { id: true, ownerId: true },
  });
  return ds;
}

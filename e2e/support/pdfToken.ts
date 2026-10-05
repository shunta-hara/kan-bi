/**
 * E2E テスト用 PDF トークン生成ヘルパー (FEAT-E2E-004)。
 *
 * src/lib/pdf/pdfToken.ts と同等のトークンを生成するが、"server-only" を
 * import しないことでテストプロセスから直接利用できる。
 *
 * - jose の SignJWT を直接使い、src の pdfToken.ts と同じ署名形式 (HS256) で
 *   トークンを生成する
 * - DB への PdfToken 行の挿入も行い、consumePdfToken が検証できる状態を作る
 * - テスト後の後始末として cleanupPdfTokensByUserId を提供する
 */

import { SignJWT } from "jose";
import { prismaE2e } from "./db";

/** PDF トークンの有効期間（秒）。pdfToken.ts に合わせる。 */
const PDF_TOKEN_TTL_SECONDS = 5 * 60; // 5 分

/** JWT 署名アルゴリズム。pdfToken.ts に合わせる。 */
const ALGORITHM = "HS256";

/**
 * テスト用署名キーを取得する。
 * PDF_SECRET が設定されている場合はそちらを優先する（pdfToken.ts の動作に合わせる）。
 */
function getSigningKey(): Uint8Array {
  const secret =
    process.env.PDF_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "[e2e/pdfToken] PDF_SECRET or AUTH_SECRET is not set. Ensure .env.e2e is loaded.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * テスト用 PDF トークンを生成し、DB の PdfToken テーブルに行を INSERT する。
 *
 * 生成されたトークンは `/dashboards/:id/print` の `x-pdf-token` ヘッダーに使用でき、
 * サーバー側の `consumePdfToken` による検証をパスする（DB に jti が存在するため）。
 *
 * @param userId トークンを束縛するユーザー ID
 * @param dashboardId トークンを束縛するダッシュボード ID
 * @returns 署名済み JWT 文字列
 */
export async function createTestPdfToken(
  userId: string,
  dashboardId: string,
): Promise<string> {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + PDF_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(exp * 1000);

  const key = getSigningKey();

  const token = await new SignJWT({ dashboardId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setJti(jti)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  // DB に jti レコードを保存（consumePdfToken の存在チェックに必要）
  await prismaE2e.pdfToken.create({
    data: { jti, userId, dashboardId, expiresAt },
  });

  return token;
}

/**
 * 指定ユーザーに紐づく PdfToken レコードを削除する。
 *
 * PdfToken は Prisma スキーマで User への @relation が定義されていないため、
 * cleanupUsers では自動削除されない。テストの後始末として明示的に呼ぶ。
 *
 * @param userIds 削除対象ユーザーの ID 配列
 */
export async function cleanupPdfTokensByUserId(
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  await prismaE2e.pdfToken.deleteMany({
    where: { userId: { in: userIds } },
  });
}

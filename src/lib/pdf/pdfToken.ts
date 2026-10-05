import "server-only";

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

import { prisma } from "@/lib/db/prisma";
import { pdfTokenPayloadSchema } from "@/lib/pdf/schema";
import type { PdfTokenPayload } from "@/lib/pdf/schema";

/** PDF トークンの有効期間（秒）。仕様: 短命・単回使用。 */
const PDF_TOKEN_TTL_SECONDS = 5 * 60; // 5 分

/** JWT 署名アルゴリズム。 */
const ALGORITHM = "HS256";

/**
 * `AUTH_SECRET` から署名キーを生成する。
 * PDF_SECRET が設定されている場合はそちらを優先する（環境分離）。
 */
function getSigningKey(): Uint8Array {
  const secret =
    process.env.PDF_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "[pdf] PDF_SECRET or AUTH_SECRET is not set. Cannot sign PDF tokens.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * PDF トークンを生成し、DB に jti レコードを保存する。
 *
 * @param userId - トークンを束縛するユーザー ID
 * @param dashboardId - トークンを束縛するダッシュボード ID
 * @returns 署名済み JWT 文字列と有効期限
 */
export async function issuePdfToken(
  userId: string,
  dashboardId: string,
): Promise<{ token: string; expiresAt: Date }> {
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

  // jti を DB に保存して単回使用チェックを可能にする
  await prisma.pdfToken.create({
    data: {
      jti,
      userId,
      dashboardId,
      expiresAt,
    },
  });

  // 期限切れレコードを非同期で削除（MVP: 生成時にまとめてクリーンアップ）
  void prisma.pdfToken
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch((e: unknown) => {
      console.error("[pdf] failed to cleanup expired pdf tokens", e);
    });

  return { token, expiresAt };
}

/**
 * PDF トークンを検証し、有効な場合はペイロードを返す。
 * 検証後に `usedAt` を設定してトークンを無効化する（単回使用保証）。
 *
 * @throws Error - トークンが無効・期限切れ・使用済みの場合
 */
export async function consumePdfToken(token: string): Promise<PdfTokenPayload> {
  const key = getSigningKey();

  let rawPayload: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
    });
    rawPayload = payload as Record<string, unknown>;
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) {
      throw new Error("PDF token expired");
    }
    if (
      e instanceof joseErrors.JWTInvalid ||
      e instanceof joseErrors.JWSInvalid
    ) {
      throw new Error("PDF token invalid");
    }
    throw new Error("PDF token verification failed");
  }

  // Zod でペイロードを検証
  const parsed = pdfTokenPayloadSchema.safeParse({
    jti: rawPayload.jti,
    sub: rawPayload.sub,
    dashboardId: rawPayload.dashboardId,
    exp: rawPayload.exp,
  });
  if (!parsed.success) {
    throw new Error("PDF token payload malformed");
  }

  const payload = parsed.data;

  // DB で jti の存在・未使用・期限・束縛を確認する（エラー種別を出し分けるための事前チェック）。
  // 単回使用の保証は、この後の updateMany による条件付き更新で行う。
  const record = await prisma.pdfToken.findUnique({
    where: { jti: payload.jti },
  });

  if (!record) {
    throw new Error("PDF token not found");
  }
  if (record.usedAt !== null) {
    throw new Error("PDF token already used");
  }
  if (record.expiresAt < new Date()) {
    throw new Error("PDF token expired");
  }
  // userId / dashboardId の束縛チェック
  if (
    record.userId !== payload.sub ||
    record.dashboardId !== payload.dashboardId
  ) {
    throw new Error("PDF token binding mismatch");
  }

  // 単回使用: 未使用・未失効の場合のみ usedAt をアトミックにセットする。
  // 上の findUnique との間に、並行リクエストが先に消費した場合や失効した場合は
  // count が 0 になり拒否される。
  const now = new Date();
  const { count } = await prisma.pdfToken.updateMany({
    where: { jti: payload.jti, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) {
    throw new Error("PDF token already used or expired");
  }

  return payload;
}

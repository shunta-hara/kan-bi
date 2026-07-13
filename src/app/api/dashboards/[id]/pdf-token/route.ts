import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { issuePdfToken } from "@/lib/pdf/pdfToken";
import { pdfTokenRequestSchema } from "@/lib/pdf/schema";
import { recordAuditEvent } from "@/lib/audit/auditLog";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/dashboards/:id/pdf-token
 *
 * PDF 出力用の単回使用トークンを発行する（FEAT-013）。
 *
 * - 認証必須: 未ログインは 401。
 * - 所有権チェック: 他ユーザーのダッシュボードは 404（存在を漏らさない）。
 * - トークンは署名付き JWT（jose）+ DB jti レコードで単回使用・短命を保証。
 * - CLAUDE.md: ヘッダー渡しを前提とするため、レスポンスに token 文字列を返すのみ。
 */
export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dashboardId } = await params;

  // 所有権チェック
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
    select: { id: true, ownerId: true, title: true },
  });
  if (!dashboard || dashboard.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // リクエストボディをパース（用紙サイズ・向き）
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = pdfTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { paperSize, orientation } = parsed.data;

  // トークン発行
  const { token, expiresAt } = await issuePdfToken(
    session.user.id,
    dashboardId,
  );

  // 監査ログ: PDF エクスポート
  await recordAuditEvent({
    type: "EXPORT_PDF",
    userId: session.user.id,
    metadata: {
      dashboardId,
      dashboardTitle: dashboard.title,
      paperSize,
      orientation,
    },
  });

  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    paperSize,
    orientation,
  });
}

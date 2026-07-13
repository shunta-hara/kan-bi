import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { issuePdfToken } from "@/lib/pdf/pdfToken";
import { pdfTokenRequestSchema, toPdfFormat } from "@/lib/pdf/schema";
import { recordAuditEvent } from "@/lib/audit/auditLog";
import { generateDashboardPdf } from "@/lib/pdf/playwrightPdf";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboards/:id/pdf
 *
 * ダッシュボードを PDF として生成して返す（FEAT-013）。
 *
 * フロー:
 * 1. Auth.js セッションでユーザー認証・ダッシュボード所有権チェック
 * 2. 内部で PDF トークンを発行（単回使用・5 分有効）
 * 3. Playwright で `/dashboards/:id/print` をレンダリング
 *    （`X-Pdf-Token` ヘッダーでトークンを渡す）
 * 4. PDF バイナリを `Content-Disposition: attachment` で返す
 *
 * クエリパラメータ:
 * - `paperSize`: "A4" | "A3"（省略時: "A4"）
 * - `orientation`: "portrait" | "landscape"（省略時: "portrait"）
 *
 * セキュリティ:
 * - 認証は通常の Auth.js セッション Cookie で行う
 * - Playwright に渡す PDF トークンはサーバー内部でのみ使用し、クライアントには渡さない
 * - PDF トークンはこのリクエスト内で発行・消費される（単回使用保証）
 */
export async function GET(
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

  // クエリパラメータをパース（用紙サイズ・向き）
  const url = new URL(req.url);
  const rawOptions = {
    paperSize: url.searchParams.get("paperSize") ?? "A4",
    orientation: url.searchParams.get("orientation") ?? "portrait",
  };
  const parsedOptions = pdfTokenRequestSchema.safeParse(rawOptions);
  if (!parsedOptions.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: parsedOptions.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { paperSize, orientation } = parsedOptions.data;
  const { format, landscape } = toPdfFormat(paperSize, orientation);

  // 内部用 PDF トークンを発行（Playwright に渡すため）
  const { token: pdfToken } = await issuePdfToken(session.user.id, dashboardId);

  // 監査ログ
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

  // Playwright で印刷ページをレンダリングして PDF を生成
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateDashboardPdf({
      dashboardId,
      pdfToken,
      format,
      landscape,
      baseUrl: getBaseUrl(req),
    });
  } catch (e) {
    console.error("[pdf] PDF generation failed", e);
    return NextResponse.json(
      { error: "PDF generation failed" },
      { status: 500 },
    );
  }

  // ファイル名: ダッシュボードタイトル + 日時
  const safeTitle =
    dashboard.title.replace(/[^\w぀-鿿\s-]/g, "").trim() || "dashboard";
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${safeTitle}_${dateStr}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": pdfBuffer.length.toString(),
      // キャッシュ禁止（トークンは単回使用のため）
      "Cache-Control": "no-store",
    },
  });
}

/**
 * リクエストから ベース URL を取得する。
 * Vercel/本番環境では `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` を優先する。
 */
function getBaseUrl(req: NextRequest): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  // フォールバック: リクエストホストから構築
  const { protocol, host } = new URL(req.url);
  return `${protocol}//${host}`;
}

import { z } from "zod";

/**
 * PDF 出力関連の Zod スキーマ集約モジュール（Sprint 8 / FEAT-013）。
 *
 * - `server-only` / `prisma` クライアントに依存しないため、ユニットテストから安全に import できる。
 */

// ─────────────────────────────────────────────
// PDF トークン JWT ペイロード
// ─────────────────────────────────────────────

/**
 * PDF トークン JWT のペイロードスキーマ。
 * - `jti`: JWT ID（単回使用制御用のランダム UUID）
 * - `sub`: ユーザー ID（`{userId, dashboardId}` 束縛）
 * - `dashboardId`: ダッシュボード ID（束縛）
 * - `exp`: 有効期限（Unix タイムスタンプ）
 */
export const pdfTokenPayloadSchema = z.object({
  jti: z.string().min(1),
  sub: z.string().min(1), // userId
  dashboardId: z.string().min(1),
  exp: z.number().int().positive(),
});
export type PdfTokenPayload = z.infer<typeof pdfTokenPayloadSchema>;

// ─────────────────────────────────────────────
// PDF 出力オプション
// ─────────────────────────────────────────────

export const paperSizeSchema = z.enum(["A4", "A3"]);
export type PaperSize = z.infer<typeof paperSizeSchema>;

export const paperOrientationSchema = z.enum(["portrait", "landscape"]);
export type PaperOrientation = z.infer<typeof paperOrientationSchema>;

/**
 * `POST /api/dashboards/:id/pdf-token` のリクエストボディスキーマ。
 */
export const pdfTokenRequestSchema = z.object({
  paperSize: paperSizeSchema.default("A4"),
  orientation: paperOrientationSchema.default("portrait"),
});
export type PdfTokenRequest = z.infer<typeof pdfTokenRequestSchema>;

/**
 * `POST /api/dashboards/:id/pdf-token` のレスポンススキーマ。
 */
export const pdfTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
});
export type PdfTokenResponse = z.infer<typeof pdfTokenResponseSchema>;

// ─────────────────────────────────────────────
// A4/A3 用紙サイズ（mm → Playwright format 変換）
// ─────────────────────────────────────────────

/** 用紙サイズと向きから Playwright の `format` / `landscape` を返す。 */
export function toPdfFormat(
  size: PaperSize,
  orientation: PaperOrientation,
): { format: "A4" | "A3"; landscape: boolean } {
  return {
    format: size,
    landscape: orientation === "landscape",
  };
}

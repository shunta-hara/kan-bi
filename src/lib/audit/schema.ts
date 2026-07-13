import { z } from "zod";
import type { AuditEventType } from "@prisma/client";

/**
 * 監査ログ関連の Zod スキーマ集約モジュール（.claude/rules/typescript.md 準拠）。
 *
 * - `server-only` / `prisma` クライアントの初期化に依存しないため、
 *   ユニットテストから安全に import できる（schema 検証ロジックのみを切り出す）。
 * - 機微情報（トークン本体など）を `metadata` に含めないことを前提に、
 *   値の型をプリミティブ（string/number/boolean/null）に制限する。
 */
export const auditMetadataSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional();

export type AuditMetadata = z.infer<typeof auditMetadataSchema>;

export const recordAuditEventInputSchema = z.object({
  type: z.custom<AuditEventType>(),
  userId: z.string().min(1).optional(),
  email: z.email().optional(),
  metadata: auditMetadataSchema,
});

export type RecordAuditEventInput = z.infer<typeof recordAuditEventInputSchema>;

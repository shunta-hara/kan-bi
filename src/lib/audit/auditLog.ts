import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  recordAuditEventInputSchema,
  type RecordAuditEventInput,
} from "@/lib/audit/schema";

// 監査ログのスキーマ・型は `lib/audit/schema.ts` に集約する（テスト容易性のため
// `server-only` / `prisma` 初期化と分離している）。利用側の互換性のためここから再公開する。
export { auditMetadataSchema, type AuditMetadata } from "@/lib/audit/schema";
export { recordAuditEventInputSchema };
export type { RecordAuditEventInput };

/**
 * 重要操作（認証成功/失敗・ログアウト・エクスポート等）を監査ログに記録する。
 * ログ記録自体の失敗が本処理を止めないよう、例外は内部で握りつぶしてエラーログに残す。
 */
export async function recordAuditEvent(
  input: RecordAuditEventInput,
): Promise<void> {
  const parsed = recordAuditEventInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error("[audit] invalid audit event input", parsed.error.flatten());
    return;
  }

  const { type, userId, email, metadata } = parsed.data;

  try {
    await prisma.auditLog.create({
      data: {
        type,
        userId: userId ?? null,
        email: email ?? null,
        metadata: metadata ?? undefined,
      },
    });
  } catch (error) {
    // 監査ログの保存失敗でユーザー操作自体を失敗させない（非機能要件: 信頼性）。
    console.error("[audit] failed to record audit event", error);
  }
}

import { z } from "zod";

/**
 * アカウント削除 API の入力スキーマ（FEAT-015）。
 *
 * 削除確認フロー:
 * - `confirmed: true` を明示的に送信させることで、クライアント側の確認ステップを
 *   サーバー側でも保証する（FEAT-015: 「削除は取り消せないことが明示される」）。
 */
export const deleteAccountInputSchema = z.object({
  confirmed: z.literal(true, {
    error: "Account deletion requires explicit confirmation (confirmed: true).",
  }),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/**
 * アカウント削除 API のレスポンス型。
 * 削除成功時は 204 No Content を返すため、
 * エラー時のみレスポンスボディが存在する。
 */
export const deleteAccountErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "UNAUTHENTICATED",
      "VALIDATION_ERROR",
      "INVALID_BODY",
      "INTERNAL_ERROR",
    ]),
    message: z.string(),
  }),
});

export type DeleteAccountError = z.infer<typeof deleteAccountErrorSchema>;

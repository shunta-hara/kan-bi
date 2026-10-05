/**
 * fetch スタブの判定に使う定数 (FEAT-E2E-007)。
 *
 * これらの値は e2e/support/fetch-stub.mjs の定数と一致している。
 * 変更時は fetch-stub.mjs も同期して更新すること。
 */

/**
 * REAUTH_REQUIRED テスト用の特別な refresh_token 識別子。
 * この文字列を含む refresh_token で oauth2.googleapis.com を呼ぶと
 * fetch-stub.mjs が 400 invalid_grant を返す。
 */
export const REAUTH_INVALID_REFRESH_TOKEN = "e2e-reauth-invalid" as const;

/**
 * FORBIDDEN テスト用のスプレッドシート ID に含まれるマーカー。
 * この文字列を含む spreadsheetId で docs.google.com を呼ぶと
 * fetch-stub.mjs が 403 を返す。
 */
export const FORBIDDEN_SPREADSHEET_MARKER = "-forbidden-" as const;

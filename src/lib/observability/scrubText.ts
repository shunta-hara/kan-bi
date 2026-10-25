/**
 * エラーメッセージなどの自由記述テキストから、個人情報・秘密を伏せ字にする（FEAT-SEN-004）。
 *
 * サードパーティのエラー（Prisma・Auth.js など）のメッセージは、失敗したクエリの引数の値
 * （メールアドレスなど）やトークンを含み得る。ヘッダーやフィールド単位の除去では届かないため、
 * メッセージ本文に対しても、典型的なパターンを伏せ字にする。
 *
 * - `server-only` を付けず、ユニットテストから直接検証できる。
 * - 完全な検出は目的としない（網羅できないため、メッセージに秘密を入れない設計が前提）。
 *   典型的な漏洩経路（メールアドレス、JWT、Bearer トークン、トークン系のキー=値）を塞ぐ。
 */

/** メールアドレス（ローカル部@ドメイン.TLD）。`@scope/pkg` のようなものには一致しない */
const EMAIL_PATTERN =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** JWT 風（`eyJ` で始まる base64url が `.` で 3 つ連なる） */
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

/** `Bearer <token>` */
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** URL クエリ風の `key=value`（トークンや認可コードなど） */
const SECRET_KEY_VALUE_PATTERN =
  /\b(access_token|refresh_token|id_token|client_secret|password|code|state|token)=([^&\s"'`]+)/gi;

/** JSON 風の `"key":"value"` */
const SECRET_JSON_PATTERN =
  /("(?:access_token|refresh_token|id_token|client_secret|password)"\s*:\s*")[^"]*(")/gi;

/**
 * テキストから個人情報・秘密を伏せ字にして返す。
 * 文字列でない値（undefined など）は、そのまま返す。
 */
export function scrubText(text: string): string;
export function scrubText(text: string | undefined): string | undefined;
export function scrubText(text: string | undefined): string | undefined {
  if (typeof text !== "string" || text === "") return text;

  return text
    .replace(JWT_PATTERN, "[token]")
    .replace(BEARER_PATTERN, "Bearer [token]")
    .replace(SECRET_JSON_PATTERN, "$1[redacted]$2")
    .replace(SECRET_KEY_VALUE_PATTERN, "$1=[redacted]")
    .replace(EMAIL_PATTERN, "[email]");
}

/**
 * 認証必須パスの判定ロジック（middleware から分離）。
 *
 * - `middleware.ts` は `next-auth`（`server-only` を含む依存チェーン）を経由するため、
 *   ユニットテストから直接 import できない。判定ロジックのみをここに切り出すことで、
 *   依存を持たずにテスト可能にする（.claude/rules/architecture.md: lib/ はレイヤー単位で完結させる）。
 * - 完全一致、または `<prefix>/...` の形のみ保護対象とする
 *   （`/dashboardsXxx` のような前方一致の誤検知を避けるため、`startsWith(prefix)` ではなく
 *   `prefix` との完全一致 or `${prefix}/` 始まりで判定する）。
 *
 * ## 除外パス
 * - `/dashboards/:id/print`: 独自の PDF トークン認証（`x-pdf-token` ヘッダー）を持つため、
 *   Auth.js セッション Cookie による認証は不要。ページコンポーネント内で `consumePdfToken` が
 *   トークンを検証するため、ミドルウェアによる除外はセキュリティ上の問題を生じない
 *   （FEAT-BF-001）。
 */

export const PROTECTED_PREFIXES = [
  "/dashboards",
  "/datasources",
  "/settings",
] as const;

/**
 * ミドルウェア認証ガードから除外するパスのパターン（FEAT-BF-001）。
 * `/dashboards/:id/print` — `:id` はスラッシュを含まない1セグメント。
 */
export const PRINT_PATH_REGEX = /^\/dashboards\/[^/]+\/print$/;

export function isProtectedPath(pathname: string): boolean {
  // /dashboards/:id/print は PDF トークン認証を使用するため、
  // セッション Cookie によるミドルウェア認証ガードの対象から除外する（FEAT-BF-001）
  if (PRINT_PATH_REGEX.test(pathname)) return false;

  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

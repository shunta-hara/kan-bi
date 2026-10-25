/**
 * Sentry イベントから個人情報・認証情報を除去するフィルタリング関数（FEAT-SEN-004）。
 *
 * - `server-only` を付けないことでユニットテストから直接検証できる。
 * - イベントを破棄しない（null を返さない）。常に除去処理後のイベントを返す。
 */

import type { Event } from "@sentry/nextjs";

/** 除去対象のヘッダー名（小文字正規化済み） */
const SCRUBBED_HEADERS = new Set([
  "cookie",
  "authorization",
  "x-pdf-token",
  "set-cookie",
  "proxy-authorization",
  // IP アドレスを含むヘッダー
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
]);

/**
 * Sentry イベントから個人情報・認証情報を除去する。
 *
 * 除去対象:
 * - リクエストヘッダーの cookie / authorization / x-pdf-token / set-cookie /
 *   proxy-authorization / x-forwarded-for / x-real-ip / x-vercel-forwarded-for /
 *   cf-connecting-ip（大小文字問わず）
 * - `request.cookies`（ヘッダーとは別の Cookie フィールド）
 * - `request.query_string`（OAuth code / state 等が含まれ得る）
 * - `request.url` のクエリ文字列部分（パスのみ残す。不正 URL でも例外をスローしない）
 * - `user.email` / `user.ip_address`
 * - `request.data`（リクエストボディ全体）
 *
 * @param event Sentry イベント（null/undefined でも例外をスローしない）
 * @returns 除去後のイベント（破棄しない）
 */
export function scrubSentryEvent(event: Event | null | undefined): Event {
  if (event == null) {
    return {};
  }

  const result: Event = { ...event };

  // リクエスト情報の除去
  if (result.request != null) {
    result.request = { ...result.request };

    // ヘッダーの除去
    if (result.request.headers != null) {
      const scrubbedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.request.headers)) {
        if (!SCRUBBED_HEADERS.has(key.toLowerCase())) {
          scrubbedHeaders[key] = value as string;
        }
      }
      result.request.headers = scrubbedHeaders;
    }

    // Cookie オブジェクトの除去（headers とは別フィールド）
    if (result.request.cookies !== undefined) {
      result.request = { ...result.request, cookies: undefined };
    }

    // クエリ文字列の除去（OAuth code / state など機密パラメータが含まれ得る）
    if (result.request.query_string !== undefined) {
      result.request = { ...result.request, query_string: undefined };
    }

    // URL のクエリ部分を除去（パスのみ残す）
    if (result.request.url != null) {
      result.request = {
        ...result.request,
        url: stripQueryFromUrl(result.request.url),
      };
    }

    // リクエストボディの除去
    if (result.request.data !== undefined) {
      result.request = { ...result.request, data: undefined };
    }
  }

  // ユーザー情報の除去
  if (result.user != null) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email: _email, ip_address: _ip, ...restUser } = result.user;
    result.user = Object.keys(restUser).length > 0 ? restUser : undefined;
  }

  return result;
}

/**
 * URL からクエリ文字列とフラグメントを除去し、パスのみを返す。
 * 不正な URL 文字列でも例外をスローしない。
 */
function stripQueryFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // origin + pathname のみ（search / hash を除く）
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // 不正 URL（パス文字列など）はクエリ区切り文字で単純に切り捨てる
    const qIdx = url.indexOf("?");
    const hIdx = url.indexOf("#");
    const cutIdx =
      qIdx === -1 && hIdx === -1
        ? url.length
        : qIdx === -1
          ? hIdx
          : hIdx === -1
            ? qIdx
            : Math.min(qIdx, hIdx);
    return url.slice(0, cutIdx);
  }
}

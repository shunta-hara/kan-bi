import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ParsedRange } from "@/lib/sheets/schema";
import { SheetFetchError } from "@/lib/sheets/errors";

/**
 * OAuth 増分認可によるプライベートシート取得（仕様書 §5 FR-1 主方式）。
 *
 * Sprint 1 で構築した Auth.js の認証基盤の上に、Google Sheets API v4
 * （`spreadsheets.readonly`）への増分スコープ付与を前提としたサーバー側取得経路を実装する。
 *
 * - 実際の sensitive scope 審査・本番 OAuth クライアント設定が整うまでは、本経路の
 *   実機検証はできない（コード上の経路は用意し、Sprint 2 の動作確認は主に
 *   `publicSheetClient`（公開シート / gviz CSV）で行う。詳細はオーケストレーターからの
 *   指示・[[project-web-bi-sprint2]] を参照）。
 * - アクセストークンが失効している場合はリフレッシュトークンで再取得し、
 *   それも失敗する（= revoke 済み）場合は `REAUTH_REQUIRED` として扱う
 *   （FEAT-006「再認可が必要」状態への土台。実装自体は Sprint 4 で仕上げる）。
 */

const SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_REFRESH_SKEW_SEC = 60;

type GoogleAccountRecord = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

async function loadGoogleAccount(
  userId: string,
): Promise<GoogleAccountRecord | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });
  return account;
}

function hasSheetsScope(scope: string | null): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(SHEETS_READONLY_SCOPE);
}

function isAccessTokenFresh(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return expiresAt - TOKEN_REFRESH_SKEW_SEC > nowSec;
}

type RefreshedTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
};

function isRefreshedTokenResponse(
  value: unknown,
): value is RefreshedTokenResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.access_token === "string" &&
    typeof record.expires_in === "number"
  );
}

/**
 * Google のトークンエンドポイントでアクセストークンをリフレッシュする。
 * `refresh_token` が無効化されている場合（revoke 済み）は `REAUTH_REQUIRED` を投げる。
 */
async function refreshAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new SheetFetchError(
      "UNKNOWN",
      "Google OAuth client is not configured on the server.",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new SheetFetchError(
      "NETWORK_ERROR",
      "Failed to reach Google to refresh the access token.",
      { cause: error },
    );
  }

  if (response.status === 400 || response.status === 401) {
    // `invalid_grant` 等 — リフレッシュトークンが失効/取り消し済み
    throw new SheetFetchError(
      "REAUTH_REQUIRED",
      "Google access was revoked. Please re-authorize this data source.",
    );
  }

  if (!response.ok) {
    throw new SheetFetchError(
      "UNKNOWN",
      `Failed to refresh the Google access token (HTTP ${response.status}).`,
    );
  }

  const json: unknown = await response.json();
  if (!isRefreshedTokenResponse(json)) {
    throw new SheetFetchError(
      "UNKNOWN",
      "Received an unexpected response while refreshing the Google access token.",
    );
  }

  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in;
  await prisma.account.updateMany({
    where: { userId, provider: "google" },
    data: { access_token: json.access_token, expires_at: expiresAt },
  });

  return json.access_token;
}

/**
 * 本人のプライベートシートを読むための有効なアクセストークンを取得する。
 * 必要に応じてリフレッシュを行い、`spreadsheets.readonly` スコープが
 * 付与されていない場合は増分認可が必要であることを示す。
 */
async function resolveAccessToken(userId: string): Promise<string> {
  const account = await loadGoogleAccount(userId);
  if (!account) {
    throw new SheetFetchError(
      "REAUTH_REQUIRED",
      "No linked Google account was found. Please sign in again.",
    );
  }

  if (!hasSheetsScope(account.scope)) {
    throw new SheetFetchError(
      "REAUTH_REQUIRED",
      "Additional Google Sheets access is required. Please grant access to continue.",
    );
  }

  if (account.access_token && isAccessTokenFresh(account.expires_at)) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new SheetFetchError(
      "REAUTH_REQUIRED",
      "Google access has expired and cannot be refreshed automatically. Please re-authorize.",
    );
  }

  return refreshAccessToken(userId, account.refresh_token);
}

function buildSheetsRangeParam(
  spreadsheetId: string,
  range: ParsedRange,
): string {
  if (range.sheetName && range.cellRange)
    return `${range.sheetName}!${range.cellRange}`;
  if (range.sheetName) return range.sheetName;
  if (range.cellRange) return range.cellRange;
  // どちらも指定されていない場合は、Sheets API には範囲を渡さない
  // （呼び出し側の `parseRange` が null を返すため通常到達しない）
  return spreadsheetId;
}

type SheetsValuesResponse = {
  values?: unknown;
};

function isSheetsValuesResponse(value: unknown): value is SheetsValuesResponse {
  return typeof value === "object" && value !== null;
}

function isStringMatrix(value: unknown): value is string[][] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (row) =>
      Array.isArray(row) &&
      row.every(
        (cell) =>
          typeof cell === "string" ||
          typeof cell === "number" ||
          typeof cell === "boolean",
      ),
  );
}

/**
 * Google Sheets API v4（`spreadsheets.values.get`）から本人のプライベートシートを取得する。
 */
export async function fetchOAuthSheetRows(
  userId: string,
  spreadsheetId: string,
  range: ParsedRange,
): Promise<string[][]> {
  const accessToken = await resolveAccessToken(userId);
  const rangeParam = buildSheetsRangeParam(spreadsheetId, range);

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rangeParam)}`,
  );
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (error) {
    throw new SheetFetchError(
      "NETWORK_ERROR",
      "Failed to reach the Google Sheets API (network error or timeout).",
      { cause: error },
    );
  }

  if (response.status === 401) {
    throw new SheetFetchError(
      "REAUTH_REQUIRED",
      "Google access was rejected. Please re-authorize this data source.",
    );
  }

  if (response.status === 403) {
    throw new SheetFetchError(
      "FORBIDDEN",
      "You do not have permission to view this spreadsheet with your Google account.",
    );
  }

  if (response.status === 404) {
    throw new SheetFetchError(
      "NOT_FOUND",
      "The spreadsheet or range was not found. Check the URL and range.",
    );
  }

  if (response.status === 400) {
    throw new SheetFetchError(
      "INVALID_RANGE",
      "The specified range or sheet name could not be resolved by the spreadsheet.",
    );
  }

  if (!response.ok) {
    throw new SheetFetchError(
      "UNKNOWN",
      `The spreadsheet could not be fetched (HTTP ${response.status}).`,
    );
  }

  const json: unknown = await response.json();
  if (!isSheetsValuesResponse(json) || !isStringMatrix(json.values ?? [])) {
    throw new SheetFetchError(
      "PARSE_ERROR",
      "Received an unexpected response from the Google Sheets API.",
    );
  }

  const values = (json.values ?? []) as Array<Array<string | number | boolean>>;
  if (values.length === 0) {
    throw new SheetFetchError(
      "EMPTY_RESULT",
      "The spreadsheet returned no data for the specified range.",
    );
  }

  return values.map((row) => row.map((cell) => String(cell)));
}

export { SHEETS_READONLY_SCOPE };

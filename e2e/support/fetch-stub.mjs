/**
 * Google API fetch スタブ (ESM モジュール)
 *
 * NODE_OPTIONS="--import ./e2e/support/fetch-stub.mjs" で Next.js サーバーに読み込まれ、
 * globalThis.fetch を差し替えて Google への実ネットワーク接続を防ぐ。
 *
 * 起動方式の判断: next dev を採用する。
 * - next start は事前ビルドが必要で E2E 実行が遅くなる
 * - next dev では --import フックが Node.js 起動直後に実行されるため、
 *   Next.js がルートハンドラを評価する前に globalThis.fetch が差し替わる
 * - Next.js が fetch をラップしても、ラップ対象が既にスタブ済みの fetch になるため
 *   Google URL への呼び出しはスタブを通る
 * - cache: "no-store" を使うルートハンドラは Next.js のキャッシュをバイパスするため
 *   スタブの応答がそのまま返る
 *
 * スタブが返す固定データ:
 * - docs.google.com (gviz CSV): ヘッダー + 3行、文字列・数値・日付各1列
 *   - URL パスに "-forbidden-" を含む場合は 403 を返す（FEAT-E2E-007 アクセス拒否テスト用）
 * - sheets.googleapis.com (Sheets API): 同等の JSON 形式
 * - oauth2.googleapis.com (トークン): ダミーアクセストークン
 *   - リクエストボディに "e2e-reauth-invalid" を含む refresh_token は 400 invalid_grant を返す
 *     （FEAT-E2E-007 REAUTH_REQUIRED テスト用）
 * - その他: 素通し (localhost 等を含む)
 */

// ヘッダー行 + 3 データ行、文字列・数値・日付の各列を含む
const FIXED_CSV =
  "Name,Revenue,OrderDate\n" +
  '"Alice",1000,2024-01-01\n' +
  '"Bob",2000,2024-01-02\n' +
  '"Charlie",3000,2024-01-03\n';

const FIXED_SHEETS_JSON = JSON.stringify({
  values: [
    ["Name", "Revenue", "OrderDate"],
    ["Alice", "1000", "2024-01-01"],
    ["Bob", "2000", "2024-01-02"],
    ["Charlie", "3000", "2024-01-03"],
  ],
});

const FIXED_TOKEN_JSON = JSON.stringify({
  access_token: "stub-access-token-e2e",
  expires_in: 3600,
  token_type: "Bearer",
});

const INVALID_GRANT_JSON = JSON.stringify({
  error: "invalid_grant",
  error_description: "Token has been expired or revoked.",
});

/**
 * REAUTH_REQUIRED テスト用の特別な refresh_token 識別子。
 * この文字列を含む refresh_token で oauth2.googleapis.com を呼ぶと 400 を返す。
 * 値は e2e/support/stub-constants.ts の REAUTH_INVALID_REFRESH_TOKEN と一致している。
 */
const REAUTH_INVALID_REFRESH_TOKEN = "e2e-reauth-invalid";

/**
 * FORBIDDEN テスト用のスプレッドシート ID に含まれるマーカー。
 * この文字列を含む spreadsheetId で docs.google.com を呼ぶと 403 を返す。
 * 値は e2e/support/stub-constants.ts の FORBIDDEN_SPREADSHEET_MARKER と一致している。
 */
const FORBIDDEN_SPREADSHEET_MARKER = "-forbidden-";

const originalFetch = globalThis.fetch;

/**
 * リクエストの URL 文字列を取得する。
 * fetch(url, init) / fetch(Request, init) / fetch(URL, init) の各形式に対応する。
 */
function getUrlString(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  // Request オブジェクト
  if (input && typeof input.url === "string") return input.url;
  return "";
}

/**
 * URL からホスト名を取り出す。パースできない入力（相対 URL 等）は空文字を返し、素通しにする。
 * 部分一致ではなく完全一致で判定するため、クエリやパスに Google のホスト名を含む
 * アプリ内部のリクエストを誤ってスタブしない。
 */
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * POST ボディから文字列表現を取得する。
 * URLSearchParams / string / その他 toString() を試みる。
 */
function getBodyString(init) {
  const body = init?.body;
  if (!body) return "";
  if (typeof body === "string") return body;
  // URLSearchParams は toString() でエンコード済み文字列を返す
  if (body && typeof body.toString === "function") return body.toString();
  return "";
}

/** URL のパス部分だけを返す（クエリ文字列は含めない）。パースできなければ空文字。 */
function getPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

globalThis.fetch = async function stubbedFetch(input, init) {
  const urlStr = getUrlString(input);
  const hostname = getHostname(urlStr);

  // docs.google.com → 固定 CSV (gviz エンドポイント)
  // URL パスに FORBIDDEN_SPREADSHEET_MARKER を含む場合は 403 を返す
  if (hostname === "docs.google.com") {
    if (getPathname(urlStr).includes(FORBIDDEN_SPREADSHEET_MARKER)) {
      return new Response("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response(FIXED_CSV, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=UTF-8" },
    });
  }

  // sheets.googleapis.com → 固定 JSON (Sheets API v4)
  if (hostname === "sheets.googleapis.com") {
    return new Response(FIXED_SHEETS_JSON, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
  }

  // oauth2.googleapis.com → ダミートークン（または invalid_grant エラー）
  // POST ボディに REAUTH_INVALID_REFRESH_TOKEN を含む場合は 400 invalid_grant を返す
  if (hostname === "oauth2.googleapis.com") {
    const bodyStr = getBodyString(init);
    if (bodyStr.includes(REAUTH_INVALID_REFRESH_TOKEN)) {
      return new Response(INVALID_GRANT_JSON, {
        status: 400,
        headers: { "Content-Type": "application/json; charset=UTF-8" },
      });
    }
    return new Response(FIXED_TOKEN_JSON, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
  }

  // それ以外は素通し (localhost のアプリ内部通信・Next.js 内部リクエスト等)
  return originalFetch(input, init);
};

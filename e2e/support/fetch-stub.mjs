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
 * - sheets.googleapis.com (Sheets API): 同等の JSON 形式
 * - oauth2.googleapis.com (トークン): ダミーアクセストークン
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

globalThis.fetch = async function stubbedFetch(input, init) {
  const url = getUrlString(input);

  // docs.google.com → 固定 CSV (gviz エンドポイント)
  if (url.includes("docs.google.com")) {
    return new Response(FIXED_CSV, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=UTF-8" },
    });
  }

  // sheets.googleapis.com → 固定 JSON (Sheets API v4)
  if (url.includes("sheets.googleapis.com")) {
    return new Response(FIXED_SHEETS_JSON, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
  }

  // oauth2.googleapis.com → ダミートークン
  if (url.includes("oauth2.googleapis.com")) {
    return new Response(FIXED_TOKEN_JSON, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    });
  }

  // それ以外は素通し (localhost のアプリ内部通信・Next.js 内部リクエスト等)
  return originalFetch(input, init);
};

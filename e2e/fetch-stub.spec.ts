/**
 * fetch スタブ単体のテスト（FEAT-E2E-001）。
 *
 * スタブは Next サーバーのプロセスにだけ読み込まれるため、テストプロセスとは別の
 * Node プロセスに `--import` で読み込ませ、ホストの判定が完全一致であることを検証する。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { test, expect } from "@playwright/test";

const stubUrl = pathToFileURL(
  path.join(process.cwd(), "e2e/support/fetch-stub.mjs"),
).href;

type ProbeResult = { status: number; body: string } | { error: string };

/** スタブを読み込んだ別プロセスで、指定 URL を fetch した結果を返す */
function probe(targetUrl: string): ProbeResult {
  const script = `
    fetch(${JSON.stringify(targetUrl)})
      .then(async (r) => console.log(JSON.stringify({ status: r.status, body: await r.text() })))
      .catch((e) => console.log(JSON.stringify({ error: e.name + ": " + e.message })));
  `;
  const out = execFileSync(
    process.execPath,
    ["--import", stubUrl, "-e", script],
    { encoding: "utf-8", timeout: 15_000 },
  );
  return JSON.parse(out.trim()) as ProbeResult;
}

test.describe("fetch stub host matching — FEAT-E2E-001", () => {
  test("Google のホストには固定データを返す", () => {
    const csv = probe("https://docs.google.com/spreadsheets/d/x/gviz/tq");
    expect(csv).toMatchObject({ status: 200 });
    expect("body" in csv && csv.body).toContain("Name,Revenue,OrderDate");

    const sheets = probe("https://sheets.googleapis.com/v4/spreadsheets/x");
    expect("body" in sheets && sheets.body).toContain("Alice");

    const token = probe("https://oauth2.googleapis.com/token");
    expect("body" in token && token.body).toContain("stub-access-token-e2e");
  });

  test("クエリやパスに Google のホスト名を含むだけの URL はスタブしない", () => {
    // ポート 1 には何も待ち受けていないので、素通しなら接続エラーになる。
    // 部分一致でスタブされていれば 200 の固定 CSV が返ってしまう。
    const result = probe("http://127.0.0.1:1/?u=docs.google.com");
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("status");

    const pathMatch = probe("http://127.0.0.1:1/sheets.googleapis.com/x");
    expect(pathMatch).toHaveProperty("error");
  });
});

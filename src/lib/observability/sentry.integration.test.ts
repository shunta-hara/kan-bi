// @vitest-environment node
/**
 * Sentry 統合テスト（FEAT-SEN-001, FEAT-SEN-002, FEAT-SEN-005, FEAT-SEN-006）。
 *
 * ローカル HTTP サーバーを DSN の送信先として使い、
 * 実際に Sentry SDK が envelope を送信することを検証する。
 * 外部ネットワークには接続しない。
 *
 * テスト後は Sentry.close() でフラッシュし、サーバーを停止する。
 */

import * as http from "node:http";
import * as zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Sentry を動的に import する（NEXT_RUNTIME 設定後に初期化するため）
let Sentry: typeof import("@sentry/nextjs");
let captureServerException: typeof import("@/lib/observability/logger").captureServerException;
let logWidgetFetchError: typeof import("@/lib/observability/logger").logWidgetFetchError;

/** 受信した envelope のペイロード一覧 */
const receivedPayloads: Record<string, unknown>[] = [];

let server: http.Server;
let serverPort: number;

/** エンベロープボディを解析してペイロードを抽出する */
function parseEnvelope(
  body: Buffer,
): { header: Record<string, unknown>; payload: Record<string, unknown> }[] {
  const text = body.toString("utf-8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const results: {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  }[] = [];

  // envelope: 1行目=エンベロープヘッダー、以降は2行ペア（アイテムヘッダー + ペイロード）
  let i = 1; // 0 行目はエンベロープヘッダーをスキップ
  while (i < lines.length - 1) {
    try {
      const itemHeader = JSON.parse(lines[i]!) as Record<string, unknown>;
      const payload = JSON.parse(lines[i + 1]!) as Record<string, unknown>;
      results.push({ header: itemHeader, payload });
    } catch {
      // パース失敗は無視
    }
    i += 2;
  }
  return results;
}

/** ペイロードのフラット化（ネストされた request/user も検索対象にする） */
function payloadContains(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  const str = JSON.stringify(payload);
  // キーが含まれているかを確認（値として含まれていても検知）
  return str.includes(`"${key}"`);
}

beforeAll(async () => {
  // HTTP 受信サーバーを起動
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks);
        const encoding = req.headers["content-encoding"];

        let bodyBuf = rawBody;
        if (encoding === "gzip") {
          try {
            bodyBuf = zlib.gunzipSync(rawBody);
          } catch {
            // gzip 展開失敗時はそのまま使う
          }
        }

        const items = parseEnvelope(bodyBuf);
        for (const { payload } of items) {
          receivedPayloads.push(payload);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"id":"test-event-id"}');
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      serverPort = addr.port;
      resolve();
    });
  });

  // Sentry を DSN 付きで初期化
  // process.env.SENTRY_DSN を設定することで captureServerException / onRequestError の
  // DSN ガードを通過させる（DSN 未設定なら @sentry/nextjs を import しない）。
  const localDsn = `http://publickey@127.0.0.1:${serverPort}/1`;
  process.env.SENTRY_DSN = localDsn;

  Sentry = await import("@sentry/nextjs");
  const { buildSentryOptions } =
    await import("@/lib/observability/sentryOptions");

  const options = buildSentryOptions({
    dsn: localDsn,
    environment: "test-env",
    release: "test-release-1.0.0",
  });

  if (options.shouldInit) {
    Sentry.init(options);
  }

  // logger 関数を import
  const logger = await import("@/lib/observability/logger");
  captureServerException = logger.captureServerException;
  logWidgetFetchError = logger.logWidgetFetchError;
});

afterAll(async () => {
  // Sentry のバッファをフラッシュ
  await Sentry.close(3000).catch(() => undefined);
  // テスト用に設定した環境変数をクリーンアップ
  delete process.env.SENTRY_DSN;
  // サーバーを停止
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * ローカルサーバーに届いたペイロードの中から条件に合うものを待つ。
 * Sentry は非同期で送信するため、短時間ポーリングする。
 */
async function waitForPayload(
  matcher: (p: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = receivedPayloads.find(matcher);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Payload not received within ${timeoutMs}ms. Received: ${JSON.stringify(receivedPayloads)}`,
  );
}

describe("Sentry 統合テスト", () => {
  it("(a) onRequestError にエラーを渡すとイベントがローカルサーバーに届く", async () => {
    const { onRequestError } = await import("@/instrumentation");

    const testError = new Error("test server request error");

    // onRequestError は Sentry.captureRequestError を参照している
    // DSN 設定済みなので実際に送信される
    await onRequestError(
      testError,
      {
        path: "/api/test",
        method: "GET",
        headers: {
          cookie: "session=secret-cookie",
          authorization: "Bearer secret-token",
          "x-pdf-token": "secret-pdf-token",
          "x-forwarded-for": "192.168.0.1",
          "x-request-id": "req-123",
        },
      },
      { routerKind: "App Router", routePath: "/api/test", routeType: "route" },
    );

    // イベントが届くまで待つ
    const payload = await waitForPayload(
      (p) =>
        typeof p.exception === "object" &&
        p.exception !== null &&
        JSON.stringify(p.exception).includes("test server request error"),
    );

    // イベントが届いた
    expect(payload).toBeDefined();

    // 環境名とリリースが付く
    expect(payload.environment).toBe("test-env");
    expect(payload.release).toBe("test-release-1.0.0");

    // 個人情報が含まれない（request.headers の各種フィールドも確認）
    const reqHeaders = (payload.request as Record<string, unknown> | undefined)
      ?.headers as Record<string, unknown> | undefined;
    expect(reqHeaders).not.toHaveProperty("cookie");
    expect(reqHeaders).not.toHaveProperty("authorization");
    expect(reqHeaders).not.toHaveProperty("x-pdf-token");
    expect(reqHeaders).not.toHaveProperty("x-forwarded-for");
    // request.cookies も含まれない
    expect(
      (payload.request as Record<string, unknown> | undefined)?.cookies,
    ).toBeUndefined();
    // 値として含まれていないことも確認
    expect(payloadContains(payload, "secret-cookie")).toBe(false);
    expect(payloadContains(payload, "secret-token")).toBe(false);
    expect(payloadContains(payload, "secret-pdf-token")).toBe(false);
  });

  it("(b) logWidgetFetchError を呼ぶとタグ付きイベントが届く", async () => {
    logWidgetFetchError({
      widgetId: "widget-integ-test",
      dataSourceId: "ds-integ-test",
      errorCode: "NETWORK_ERROR",
      errorMessage: "Connection refused integration test",
    });

    const payload = await waitForPayload(
      (p) =>
        JSON.stringify(p).includes("Connection refused integration test") ||
        (typeof p.tags === "object" &&
          p.tags !== null &&
          (p.tags as Record<string, unknown>).widgetId === "widget-integ-test"),
    );

    expect(payload).toBeDefined();

    // tags に widgetId・dataSourceId・errorCode が含まれる
    const tags = payload.tags as Record<string, unknown>;
    expect(tags?.widgetId).toBe("widget-integ-test");
    expect(tags?.dataSourceId).toBe("ds-integ-test");
    expect(tags?.errorCode).toBe("NETWORK_ERROR");

    // level が error
    expect(payload.level).toBe("error");

    // 環境名とリリースが付く
    expect(payload.environment).toBe("test-env");
    expect(payload.release).toBe("test-release-1.0.0");
  });

  it("(b-2) logWidgetFetchError で REAUTH_REQUIRED のとき level が warning", async () => {
    logWidgetFetchError({
      widgetId: "widget-reauth",
      dataSourceId: "ds-reauth",
      errorCode: "REAUTH_REQUIRED",
      errorMessage: "OAuth token expired integration",
    });

    const payload = await waitForPayload(
      (p) =>
        typeof p.tags === "object" &&
        p.tags !== null &&
        (p.tags as Record<string, unknown>).widgetId === "widget-reauth",
    );

    expect(payload.level).toBe("warning");
    const tags = payload.tags as Record<string, unknown>;
    expect(tags?.errorCode).toBe("REAUTH_REQUIRED");
  });

  it("(c) PDF 生成失敗を模した captureServerException でイベントが届く", async () => {
    const pdfError = new Error("PDF generation failed integration test");
    captureServerException(pdfError, { errorCode: "PDF_GENERATION_FAILED" });

    const payload = await waitForPayload(
      (p) =>
        typeof p.tags === "object" &&
        p.tags !== null &&
        (p.tags as Record<string, unknown>).errorCode ===
          "PDF_GENERATION_FAILED",
    );

    expect(payload).toBeDefined();
    expect(payload.level).toBe("error");
    const tags = payload.tags as Record<string, unknown>;
    expect(tags?.errorCode).toBe("PDF_GENERATION_FAILED");

    // 環境名とリリースが付く
    expect(payload.environment).toBe("test-env");
    expect(payload.release).toBe("test-release-1.0.0");
  });

  it("user.email が beforeSend でイベントのユーザーオブジェクトから除去される", async () => {
    // email を持つユーザーコンテキストを設定しても user.email が除去されることを確認
    // 注: スタックトレースのソースコードコンテキスト行には変数値が現れることがあるため、
    //     ペイロード全体ではなく user オブジェクトのみを検証する。
    Sentry.withScope((scope) => {
      scope.setUser({ id: "user-filter-test", email: "filtered@test.invalid" });
      Sentry.captureMessage("test message for user filter verification");
    });

    const payload = await waitForPayload((p) =>
      JSON.stringify(p).includes("test message for user filter verification"),
    );

    // user オブジェクトに email が含まれない（beforeSend で除去済み）
    const user = payload.user as Record<string, unknown> | undefined;
    expect(user?.email).toBeUndefined();
    // id は保持されている
    expect(user?.id).toBe("user-filter-test");
  });
});

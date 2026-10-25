import { describe, expect, it } from "vitest";

import { scrubText } from "@/lib/observability/scrubText";

// 秘密に見える文字列は実行時に組み立てる（ソースに値を直接書かない）
const jwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiJ1c2VyIn0",
  "c2lnbmF0dXJl",
].join(".");

describe("scrubText", () => {
  describe("伏せ字にする", () => {
    it.each([
      [
        "メールアドレス",
        "Unique constraint failed on email: 'taro.yamada+x@example.co.jp'",
        "[email]",
      ],
      ["JWT 風のトークン", `invalid session ${jwt} rejected`, "[token]"],
      [
        "Bearer トークン",
        "request failed with Authorization: Bearer abc.def-123_xyz",
        "Bearer [token]",
      ],
      [
        "refresh_token（クエリ風）",
        "POST failed: refresh_token=1//0gAbCdEf123&grant_type=refresh_token",
        "refresh_token=[redacted]",
      ],
      [
        "認可コード（クエリ風）",
        "callback?code=4/0AbCdEf&state=xyz",
        "code=[redacted]",
      ],
      [
        "JSON 風の client_secret",
        'body {"client_secret":"s3cr3t-value","x":1}',
        '"client_secret":"[redacted]"',
      ],
    ])("%s", (_label, input, expectedFragment) => {
      const result = scrubText(input);
      expect(result).toContain(expectedFragment);
    });

    it("伏せ字にした値そのものは結果に残らない", () => {
      const input = [
        "email: 'secret.person@example.com'",
        `token ${jwt}`,
        "Bearer topsecretvalue123",
        "refresh_token=rt-value-999",
      ].join(" / ");
      const result = scrubText(input);
      for (const leaked of [
        "secret.person",
        "example.com",
        jwt,
        "topsecretvalue123",
        "rt-value-999",
      ]) {
        expect(result).not.toContain(leaked);
      }
    });

    it("同じ文字列内の複数の出現をすべて伏せ字にする", () => {
      const result = scrubText("a@example.com and b@example.org");
      expect(result).toBe("[email] and [email]");
    });
  });

  describe("そのまま残す（誤検出しない）", () => {
    it.each([
      ["通常のエラーメッセージ", "Failed to fetch the spreadsheet (HTTP 403)"],
      ["スコープ付きパッケージ名", "Cannot find module '@sentry/nextjs'"],
      ["TLD のないホスト", "connect ECONNREFUSED user@localhost"],
      ["code を含む普通の単語", "error code: PDF_GENERATION_FAILED"],
      ["空文字", ""],
    ])("%s", (_label, input) => {
      expect(scrubText(input)).toBe(input);
    });

    it("undefined はそのまま undefined を返す", () => {
      expect(scrubText(undefined)).toBeUndefined();
    });
  });
});

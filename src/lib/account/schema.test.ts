import { describe, expect, it } from "vitest";
import {
  deleteAccountInputSchema,
  deleteAccountErrorSchema,
} from "@/lib/account/schema";

describe("deleteAccountInputSchema", () => {
  describe("正常系", () => {
    it("confirmed: true を許可する", () => {
      const result = deleteAccountInputSchema.safeParse({ confirmed: true });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    it("confirmed が欠けている場合は reject する", () => {
      const result = deleteAccountInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("confirmed: false は reject する（literal(true) のため）", () => {
      const result = deleteAccountInputSchema.safeParse({ confirmed: false });
      expect(result.success).toBe(false);
    });

    it("confirmed が文字列 'true' は reject する（型不一致）", () => {
      const result = deleteAccountInputSchema.safeParse({ confirmed: "true" });
      expect(result.success).toBe(false);
    });

    it("null は reject する", () => {
      const result = deleteAccountInputSchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });

  describe("境界値", () => {
    it("余分なフィールドがあっても confirmed: true なら許可する（stripUnknown）", () => {
      const result = deleteAccountInputSchema.safeParse({
        confirmed: true,
        extra: "field",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("deleteAccountErrorSchema", () => {
  describe("正常系", () => {
    it("UNAUTHENTICATED エラーを許可する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        error: { code: "UNAUTHENTICATED", message: "Sign-in is required." },
      });
      expect(result.success).toBe(true);
    });

    it("VALIDATION_ERROR を許可する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        error: {
          code: "VALIDATION_ERROR",
          message: "Confirmation required.",
        },
      });
      expect(result.success).toBe(true);
    });

    it("INVALID_BODY を許可する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        error: { code: "INVALID_BODY", message: "Bad JSON." },
      });
      expect(result.success).toBe(true);
    });

    it("INTERNAL_ERROR を許可する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        error: { code: "INTERNAL_ERROR", message: "Unexpected error." },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    it("未知のエラーコードは reject する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        error: { code: "UNKNOWN_CODE", message: "something" },
      });
      expect(result.success).toBe(false);
    });

    it("message が欠けている場合は reject する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        error: { code: "UNAUTHENTICATED" },
      });
      expect(result.success).toBe(false);
    });

    it("error プロパティが欠けている場合は reject する", () => {
      const result = deleteAccountErrorSchema.safeParse({
        code: "UNAUTHENTICATED",
        message: "Sign-in is required.",
      });
      expect(result.success).toBe(false);
    });
  });
});

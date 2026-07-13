import { describe, expect, it } from "vitest";
import {
  auditMetadataSchema,
  recordAuditEventInputSchema,
} from "@/lib/audit/schema";

describe("auditMetadataSchema", () => {
  describe("正常系", () => {
    it("string/number/boolean/null を値に持つレコードを許可する", () => {
      const input = {
        provider: "google",
        attempt: 3,
        success: false,
        reason: null,
      };

      expect(auditMetadataSchema.safeParse(input).success).toBe(true);
    });

    it("undefined（メタデータなし）を許可する（optional）", () => {
      const result = auditMetadataSchema.safeParse(undefined);

      expect(result.success).toBe(true);
      expect(result.success && result.data).toBeUndefined();
    });

    it("空オブジェクトを許可する（境界値）", () => {
      expect(auditMetadataSchema.safeParse({}).success).toBe(true);
    });
  });

  describe("異常系", () => {
    it("値がオブジェクト・配列を含む場合は reject する（機微情報の混入防止）", () => {
      const result = auditMetadataSchema.safeParse({ nested: { token: "x" } });

      expect(result.success).toBe(false);
    });

    it("値が配列の場合は reject する", () => {
      const result = auditMetadataSchema.safeParse({ list: [1, 2, 3] });

      expect(result.success).toBe(false);
    });

    it("キーが文字列でないオブジェクト形式以外の値は reject する", () => {
      expect(auditMetadataSchema.safeParse("not-a-record").success).toBe(false);
      expect(auditMetadataSchema.safeParse(123).success).toBe(false);
      expect(auditMetadataSchema.safeParse(null).success).toBe(false);
    });
  });
});

describe("recordAuditEventInputSchema", () => {
  describe("正常系", () => {
    it("type のみの最小入力を許可する", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_IN_SUCCESS",
      });

      expect(result.success).toBe(true);
    });

    it("type / userId / email / metadata をすべて含む入力を許可する", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_IN_SUCCESS",
        userId: "user_123",
        email: "user@example.com",
        metadata: { provider: "google" },
      });

      expect(result.success).toBe(true);
    });

    it("metadata が undefined でも許可する", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_OUT",
        userId: "user_123",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    it("type を欠く入力を reject する", () => {
      const result = recordAuditEventInputSchema.safeParse({
        userId: "user_123",
      });

      expect(result.success).toBe(false);
    });

    it("email が不正な形式の場合は reject する", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_IN_FAILURE",
        email: "not-an-email",
      });

      expect(result.success).toBe(false);
    });

    it("metadata に許可されない型（オブジェクト）が含まれる場合は reject する", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_IN_FAILURE",
        metadata: { token: { value: "secret" } },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("境界値", () => {
    it("userId が空文字列の場合は reject する（min(1)）", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_IN_SUCCESS",
        userId: "",
      });

      expect(result.success).toBe(false);
    });

    it("userId が1文字の場合は許可する（境界値: min(1)を満たす最小値）", () => {
      const result = recordAuditEventInputSchema.safeParse({
        type: "AUTH_SIGN_IN_SUCCESS",
        userId: "u",
      });

      expect(result.success).toBe(true);
    });
  });
});

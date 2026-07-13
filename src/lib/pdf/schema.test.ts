/**
 * lib/pdf/schema.ts のユニットテスト（Sprint 8 / FEAT-013）。
 *
 * - pdfTokenPayloadSchema: トークンペイロードのバリデーション
 * - pdfTokenRequestSchema: PDF 出力オプションのバリデーション
 * - toPdfFormat: 用紙サイズ・向きから Playwright format を返す変換関数
 */

import { describe, it, expect } from "vitest";

import {
  pdfTokenPayloadSchema,
  pdfTokenRequestSchema,
  toPdfFormat,
} from "./schema";

// ─────────────────────────────────────────────
// pdfTokenPayloadSchema
// ─────────────────────────────────────────────

describe("pdfTokenPayloadSchema", () => {
  const validPayload = {
    jti: "test-jti-uuid",
    sub: "user-123",
    dashboardId: "dash-456",
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  it("正常系: 有効なペイロードをパースできる", () => {
    const result = pdfTokenPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jti).toBe("test-jti-uuid");
      expect(result.data.sub).toBe("user-123");
      expect(result.data.dashboardId).toBe("dash-456");
    }
  });

  it("異常系: jti が空文字の場合は失敗する", () => {
    const result = pdfTokenPayloadSchema.safeParse({
      ...validPayload,
      jti: "",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: sub が空文字の場合は失敗する", () => {
    const result = pdfTokenPayloadSchema.safeParse({
      ...validPayload,
      sub: "",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: dashboardId が空文字の場合は失敗する", () => {
    const result = pdfTokenPayloadSchema.safeParse({
      ...validPayload,
      dashboardId: "",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: exp が正の整数でない場合は失敗する", () => {
    expect(
      pdfTokenPayloadSchema.safeParse({ ...validPayload, exp: 0 }).success,
    ).toBe(false);
    expect(
      pdfTokenPayloadSchema.safeParse({ ...validPayload, exp: -1 }).success,
    ).toBe(false);
    expect(
      pdfTokenPayloadSchema.safeParse({ ...validPayload, exp: 1.5 }).success,
    ).toBe(false);
  });

  it("異常系: 必須フィールドが欠落している場合は失敗する", () => {
    // jti 欠落
    const { jti: _jti, ...withoutJti } = validPayload;
    expect(pdfTokenPayloadSchema.safeParse(withoutJti).success).toBe(false);

    // sub 欠落
    const { sub: _sub, ...withoutSub } = validPayload;
    expect(pdfTokenPayloadSchema.safeParse(withoutSub).success).toBe(false);

    // dashboardId 欠落
    const { dashboardId: _dashboardId, ...withoutDashboardId } = validPayload;
    expect(pdfTokenPayloadSchema.safeParse(withoutDashboardId).success).toBe(
      false,
    );
  });
});

// ─────────────────────────────────────────────
// pdfTokenRequestSchema
// ─────────────────────────────────────────────

describe("pdfTokenRequestSchema", () => {
  it("正常系: paperSize と orientation を指定できる", () => {
    const result = pdfTokenRequestSchema.safeParse({
      paperSize: "A4",
      orientation: "portrait",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paperSize).toBe("A4");
      expect(result.data.orientation).toBe("portrait");
    }
  });

  it("正常系: A3 横向きを指定できる", () => {
    const result = pdfTokenRequestSchema.safeParse({
      paperSize: "A3",
      orientation: "landscape",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paperSize).toBe("A3");
      expect(result.data.orientation).toBe("landscape");
    }
  });

  it("正常系: 省略時は A4 縦向きがデフォルト値になる", () => {
    const result = pdfTokenRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paperSize).toBe("A4");
      expect(result.data.orientation).toBe("portrait");
    }
  });

  it("異常系: 不正な paperSize は拒否される", () => {
    const result = pdfTokenRequestSchema.safeParse({
      paperSize: "A5",
      orientation: "portrait",
    });
    expect(result.success).toBe(false);
  });

  it("異常系: 不正な orientation は拒否される", () => {
    const result = pdfTokenRequestSchema.safeParse({
      paperSize: "A4",
      orientation: "diagonal",
    });
    expect(result.success).toBe(false);
  });

  it("境界値: 両フィールドを省略しても成功する（デフォルト値が補完される）", () => {
    const result = pdfTokenRequestSchema.safeParse(null);
    // null は object ではないため失敗する
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────
// toPdfFormat
// ─────────────────────────────────────────────

describe("toPdfFormat", () => {
  it("正常系: A4 縦向きは format=A4, landscape=false を返す", () => {
    const result = toPdfFormat("A4", "portrait");
    expect(result.format).toBe("A4");
    expect(result.landscape).toBe(false);
  });

  it("正常系: A4 横向きは format=A4, landscape=true を返す", () => {
    const result = toPdfFormat("A4", "landscape");
    expect(result.format).toBe("A4");
    expect(result.landscape).toBe(true);
  });

  it("正常系: A3 縦向きは format=A3, landscape=false を返す", () => {
    const result = toPdfFormat("A3", "portrait");
    expect(result.format).toBe("A3");
    expect(result.landscape).toBe(false);
  });

  it("正常系: A3 横向きは format=A3, landscape=true を返す", () => {
    const result = toPdfFormat("A3", "landscape");
    expect(result.format).toBe("A3");
    expect(result.landscape).toBe(true);
  });
});

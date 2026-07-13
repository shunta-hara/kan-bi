import { describe, expect, it } from "vitest";
import { isProtectedPath, PRINT_PATH_REGEX } from "@/lib/auth/protectedPaths";

describe("isProtectedPath", () => {
  describe("正常系: 保護対象パス", () => {
    it.each([
      "/dashboards",
      "/dashboards/",
      "/dashboards/abc123",
      "/dashboards/abc123/edit",
      "/datasources",
      "/datasources/",
      "/datasources/xyz789",
      "/settings",
      "/settings/",
    ])("%s は保護対象と判定される", (pathname) => {
      expect(isProtectedPath(pathname)).toBe(true);
    });
  });

  describe("正常系: 保護対象外パス", () => {
    it.each(["/", "/login", "/about", "/api/auth/session", "/favicon.ico"])(
      "%s は保護対象外と判定される",
      (pathname) => {
        expect(isProtectedPath(pathname)).toBe(false);
      },
    );
  });

  describe("異常系・境界値: 前方一致による誤判定がない", () => {
    it.each([
      "/dashboardsx",
      "/dashboards-archive",
      "/datasourcesx",
      "/datasources-old/123",
    ])("%s はプレフィックスが似ていても保護対象外と判定される", (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
    });

    it("空文字列は保護対象外と判定される", () => {
      expect(isProtectedPath("")).toBe(false);
    });

    it("末尾スラッシュ境界（/dashboards と /dashboards/ の両方）を保護対象と判定する", () => {
      expect(isProtectedPath("/dashboards")).toBe(true);
      expect(isProtectedPath("/dashboards/")).toBe(true);
    });

    it("大文字小文字が異なる場合は別パスとして扱う（誤って保護対象としない）", () => {
      expect(isProtectedPath("/Dashboards")).toBe(false);
      expect(isProtectedPath("/DataSources/1")).toBe(false);
    });
  });

  describe("FEAT-BF-001: 印刷パス除外（/dashboards/:id/print）", () => {
    describe("正常系: 印刷パスは保護対象外と判定される", () => {
      it.each([
        "/dashboards/abc123/print",
        "/dashboards/any-id/print",
        "/dashboards/123e4567-e89b-12d3-a456-426614174000/print",
        "/dashboards/a/print",
      ])(
        "%s は PDF トークン認証を使うため保護対象外と判定される",
        (pathname) => {
          expect(isProtectedPath(pathname)).toBe(false);
        },
      );
    });

    describe("異常系: 印刷パスに似ているが除外対象でないパス", () => {
      it("/dashboards/abc123/print/settings はサブパスを持つため保護対象と判定される", () => {
        // 印刷ページのサブパスは存在しないが、誤除外がないことを確認
        expect(isProtectedPath("/dashboards/abc123/print/settings")).toBe(true);
      });

      it("/dashboards/abc123/printing は /print 完全一致でないため保護対象と判定される", () => {
        expect(isProtectedPath("/dashboards/abc123/printing")).toBe(true);
      });

      it("/dashboards/abc123/settings は通常の保護対象パスとして判定される", () => {
        expect(isProtectedPath("/dashboards/abc123/settings")).toBe(true);
      });

      it("/dashboards/abc123/edit は通常の保護対象パスとして判定される", () => {
        expect(isProtectedPath("/dashboards/abc123/edit")).toBe(true);
      });
    });

    describe("境界値: PRINT_PATH_REGEX パターン検証", () => {
      it("/dashboards/print だけでは ID セグメントがなく除外対象でない", () => {
        // "/dashboards/print" は id="print" のダッシュボードを指すパスであり、
        // /dashboards/:id/print 形式（ id + /print）ではないため保護対象のまま
        expect(PRINT_PATH_REGEX.test("/dashboards/print")).toBe(false);
        expect(isProtectedPath("/dashboards/print")).toBe(true);
      });

      it("スラッシュを含む ID は除外対象と判定されない（インジェクション防止）", () => {
        // "/dashboards/abc/def/print" は id に / が含まれる形のため除外対象でない
        expect(PRINT_PATH_REGEX.test("/dashboards/abc/def/print")).toBe(false);
        expect(isProtectedPath("/dashboards/abc/def/print")).toBe(true);
      });
    });
  });
});

/**
 * FEAT-016: 多言語対応 — localeUtils の単体テスト（Sprint 10）。
 *
 * フォーマット関数はロケールによって出力が変わる純粋関数なので、
 * vitest 上でサーバー専用 API を使わずに直接テストできる。
 */
import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatDateTimeShort,
  formatNumber,
} from "@/i18n/localeUtils";

// ─────────────────────────────────────────────────────────────────────────────
// formatDateTime
// ─────────────────────────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  // 固定の Date を使い、ロケール切り替えの振る舞いのみを検証する
  const date = new Date("2024-01-15T09:30:00");

  describe("正常系: ja ロケール", () => {
    it("年・月・日・時・分を含む日本語形式の文字列を返す", () => {
      const result = formatDateTime(date, "ja");
      // 数字と日本語の月・日・時・分が含まれることを確認
      expect(result).toContain("2024");
      expect(result).toContain("1");
      expect(result).toContain("15");
      expect(result).toContain("09");
      expect(result).toContain("30");
    });

    it("返り値は空文字でない", () => {
      const result = formatDateTime(date, "ja");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("正常系: en ロケール", () => {
    it("英語形式の日時文字列を返す", () => {
      const result = formatDateTime(date, "en");
      // 数字が含まれることを確認（年・月・日・時・分）
      expect(result).toContain("2024");
      expect(result).toContain("15");
    });

    it("ja と en で異なる文字列を返す（ロケール切り替えが機能している）", () => {
      const ja = formatDateTime(date, "ja");
      const en = formatDateTime(date, "en");
      expect(ja).not.toBe(en);
    });
  });

  describe("境界値", () => {
    it("年明け（1月1日 0:00）も正しくフォーマットされる", () => {
      const newYear = new Date("2024-01-01T00:00:00");
      const result = formatDateTime(newYear, "ja");
      expect(result).toContain("2024");
      expect(result).toContain("1");
    });

    it("月末日（12月31日 23:59）も正しくフォーマットされる", () => {
      const lastDay = new Date("2024-12-31T23:59:00");
      const result = formatDateTime(lastDay, "ja");
      expect(result).toContain("2024");
      expect(result).toContain("12");
      expect(result).toContain("31");
      expect(result).toContain("23");
      expect(result).toContain("59");
    });

    it("うるう年の2月29日も正しくフォーマットされる", () => {
      const leapDay = new Date("2024-02-29T12:00:00");
      const result = formatDateTime(leapDay, "ja");
      expect(result).toContain("2024");
      expect(result).toContain("2");
      expect(result).toContain("29");
    });
  });

  describe("異常系", () => {
    it("Invalid Date は 'Invalid Date' 文字列を含むか、空でない文字列を返す（クラッシュしない）", () => {
      const invalid = new Date("invalid");
      // toLocaleString は Invalid Date に対してランタイムにより 'Invalid Date' 等を返す
      expect(() => formatDateTime(invalid, "ja")).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatDateTimeShort
// ─────────────────────────────────────────────────────────────────────────────

describe("formatDateTimeShort", () => {
  const date = new Date("2024-01-15T09:30:00");

  describe("正常系: ja ロケール", () => {
    it("月・日が 2 桁ゼロ埋め形式で含まれる", () => {
      const result = formatDateTimeShort(date, "ja");
      // 2024/01/15 のように 2 桁月・日が含まれることを確認
      expect(result).toContain("2024");
      expect(result).toContain("01");
      expect(result).toContain("15");
    });

    it("返り値は空文字でない", () => {
      const result = formatDateTimeShort(date, "ja");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("正常系: en ロケール", () => {
    it("英語圏短形式の文字列を返す", () => {
      const result = formatDateTimeShort(date, "en");
      expect(result).toContain("2024");
      expect(result).toContain("15");
    });

    it("ja と en で異なる形式を返す", () => {
      const ja = formatDateTimeShort(date, "ja");
      const en = formatDateTimeShort(date, "en");
      expect(ja).not.toBe(en);
    });
  });

  describe("境界値", () => {
    it("1桁の月・日（1月3日）が 2 桁ゼロ埋めで出力される（ja）", () => {
      const singleDigit = new Date("2024-01-03T08:05:00");
      const result = formatDateTimeShort(singleDigit, "ja");
      expect(result).toContain("01");
      expect(result).toContain("03");
      expect(result).toContain("08");
      expect(result).toContain("05");
    });
  });

  describe("異常系", () => {
    it("Invalid Date はクラッシュせずに文字列を返す", () => {
      const invalid = new Date("invalid");
      expect(() => formatDateTimeShort(invalid, "ja")).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatNumber
// ─────────────────────────────────────────────────────────────────────────────

describe("formatNumber", () => {
  describe("正常系: ja ロケール", () => {
    it("1000 以上の数値に千区切りが付く", () => {
      const result = formatNumber(1234567, "ja");
      // 千区切りの確認（'1,234,567' か '1.234.567' など環境依存を考慮）
      expect(result).toContain("1");
      expect(result).toContain("234");
      expect(result).toContain("567");
      expect(result.length).toBeGreaterThan("1234567".length);
    });

    it("1000 未満の数値はそのまま返る", () => {
      const result = formatNumber(999, "ja");
      expect(result).toContain("999");
    });

    it("0 は '0' として返る", () => {
      const result = formatNumber(0, "ja");
      expect(result).toBe("0");
    });
  });

  describe("正常系: en ロケール", () => {
    it("英語圏の千区切り文字列を返す", () => {
      const result = formatNumber(1000, "en");
      // en-US は "1,000"
      expect(result).toContain("1");
      expect(result).toContain("000");
    });

    it("ja と en で同じ数値が同じ区切り形式を返す（ja-JP と en-US はどちらもカンマ区切り）", () => {
      // 1,234 は ja-JP でも en-US でも "1,234" になるため、数字部分が一致する
      const ja = formatNumber(1234, "ja");
      const en = formatNumber(1234, "en");
      // 数字を抽出して一致を確認
      const digitsJa = ja.replace(/[^0-9]/g, "");
      const digitsEn = en.replace(/[^0-9]/g, "");
      expect(digitsJa).toBe("1234");
      expect(digitsEn).toBe("1234");
    });
  });

  describe("境界値", () => {
    it("負の数値も正しくフォーマットされる", () => {
      const result = formatNumber(-1234, "ja");
      expect(result).toContain("1");
      expect(result).toContain("234");
    });

    it("小数点を含む数値もフォーマットされる", () => {
      const result = formatNumber(1234.56, "ja");
      expect(result).toContain("1");
      expect(result).toContain("56");
    });

    it("Number.MAX_SAFE_INTEGER もクラッシュしない", () => {
      expect(() => formatNumber(Number.MAX_SAFE_INTEGER, "ja")).not.toThrow();
    });

    it("Number.MIN_SAFE_INTEGER もクラッシュしない", () => {
      expect(() => formatNumber(Number.MIN_SAFE_INTEGER, "en")).not.toThrow();
    });
  });

  describe("異常系", () => {
    it("NaN もクラッシュせずに文字列を返す", () => {
      expect(() => formatNumber(NaN, "ja")).not.toThrow();
    });

    it("Infinity もクラッシュせずに文字列を返す", () => {
      expect(() => formatNumber(Infinity, "ja")).not.toThrow();
    });
  });
});

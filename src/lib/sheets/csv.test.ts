import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/sheets/csv";

describe("parseCsv", () => {
  describe("正常系", () => {
    it("単純なカンマ区切りの行を解析する", () => {
      expect(parseCsv("a,b,c\n1,2,3")).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]);
    });

    it("ダブルクォートで囲まれたフィールドを解析する", () => {
      expect(parseCsv('"a","b","c"\n"1","2","3"')).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]);
    });

    it("クォート内のカンマを区切り文字として扱わない", () => {
      expect(parseCsv('"商品名, 詳細",価格\n"りんご, 赤",100')).toEqual([
        ["商品名, 詳細", "価格"],
        ["りんご, 赤", "100"],
      ]);
    });

    it('クォート内のエスケープされたダブルクォート("") を1個の " として復元する', () => {
      expect(parseCsv('"彼は""こんにちは""と言った",1')).toEqual([
        ['彼は"こんにちは"と言った', "1"],
      ]);
    });

    it("クォート内の改行を保持してフィールド内改行として扱う", () => {
      expect(parseCsv('"行1\n行2",値\n通常行,2')).toEqual([
        ["行1\n行2", "値"],
        ["通常行", "2"],
      ]);
    });

    it("CRLF / LF どちらの改行コードも行区切りとして扱う", () => {
      expect(parseCsv("a,b\r\n1,2\nc,d")).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["c", "d"],
      ]);
    });

    it("末尾に改行がない最終行も取りこぼさない", () => {
      expect(parseCsv("a,b\n1,2")).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
    });

    it("末尾に改行がある場合に空行を余計に作らない", () => {
      expect(parseCsv("a,b\n1,2\n")).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
    });
  });

  describe("異常系・境界値", () => {
    it("空文字列は空配列を返す", () => {
      expect(parseCsv("")).toEqual([]);
    });

    it("空白のみの入力は1行1セルとして扱う", () => {
      expect(parseCsv("   ")).toEqual([["   "]]);
    });

    it("値が空のフィールド（連続するカンマ）を空文字列として扱う", () => {
      expect(parseCsv("a,,c\n,2,")).toEqual([
        ["a", "", "c"],
        ["", "2", ""],
      ]);
    });

    it("単一列のみの入力を解析する", () => {
      expect(parseCsv("only\nrow1\nrow2")).toEqual([
        ["only"],
        ["row1"],
        ["row2"],
      ]);
    });
  });
});

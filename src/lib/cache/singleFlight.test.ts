import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildFetchSingleFlightKey,
  clearSingleFlightMap,
  singleFlight,
} from "@/lib/cache/singleFlight";

afterEach(() => {
  clearSingleFlightMap();
});

describe("singleFlight", () => {
  describe("正常系", () => {
    it("単一リクエストは fn の結果をそのまま返す", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      const result = await singleFlight("key1", fn);
      expect(result).toBe("result");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("完了後に同じキーで呼び出すと fn が再度実行される", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      await singleFlight("key1", fn);
      await singleFlight("key1", fn);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("異なるキーは独立して fn が実行される", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      await Promise.all([singleFlight("keyA", fn), singleFlight("keyB", fn)]);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("シングルフライト（重複排除）", () => {
    it("同一キーへの並行呼び出しは fn を 1 回だけ実行する", async () => {
      let resolvePromise!: (value: string) => void;
      const pending = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });
      const fn = vi.fn().mockReturnValue(pending);

      // 3 つの並行リクエスト
      const p1 = singleFlight("key1", fn);
      const p2 = singleFlight("key1", fn);
      const p3 = singleFlight("key1", fn);

      resolvePromise("shared-result");

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // fn は 1 回だけ呼ばれる
      expect(fn).toHaveBeenCalledTimes(1);
      // 3 つすべてが同じ結果を受け取る
      expect(r1).toBe("shared-result");
      expect(r2).toBe("shared-result");
      expect(r3).toBe("shared-result");
    });
  });

  describe("異常系", () => {
    it("fn がエラーをスローした場合、エラーが伝播する", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fetch failed"));
      await expect(singleFlight("key1", fn)).rejects.toThrow("fetch failed");
    });

    it("fn がエラーをスローした後は次の呼び出しで fn が再実行される", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("transient error"))
        .mockResolvedValueOnce("recovered");

      await expect(singleFlight("key1", fn)).rejects.toThrow();
      // エラー後はマップからキーが削除されるため、次の呼び出しは fn を再実行する
      const result = await singleFlight("key1", fn);
      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("並行リクエストのうち 1 つがエラーになると、全員がそのエラーを受け取る", async () => {
      let rejectPromise!: (reason: Error) => void;
      const pending = new Promise<string>((_resolve, reject) => {
        rejectPromise = reject;
      });
      const fn = vi.fn().mockReturnValue(pending);

      const p1 = singleFlight("key1", fn);
      const p2 = singleFlight("key1", fn);

      rejectPromise(new Error("shared error"));

      await expect(p1).rejects.toThrow("shared error");
      await expect(p2).rejects.toThrow("shared error");
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("境界値", () => {
    it("空文字列のキーも有効なキーとして扱われる", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      await singleFlight("", fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe("buildFetchSingleFlightKey", () => {
  it("dataSourceId を含むキーを返す（正常系）", () => {
    expect(buildFetchSingleFlightKey("ds123")).toBe("ds-fetch:ds123");
  });

  it("異なる dataSourceId は異なるキーになる（境界値）", () => {
    expect(buildFetchSingleFlightKey("dsA")).not.toBe(
      buildFetchSingleFlightKey("dsB"),
    );
  });
});

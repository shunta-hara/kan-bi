import { afterEach, describe, expect, it } from "vitest";

import {
  buildRefreshRateLimitKey,
  checkRateLimit,
  clearRateLimitStore,
  DATASOURCE_REFRESH_RATE_LIMIT,
  type RateLimitConfig,
} from "@/lib/cache/rateLimit";

afterEach(() => {
  clearRateLimitStore();
});

describe("checkRateLimit", () => {
  const config: RateLimitConfig = { windowMs: 60_000, maxRequests: 3 };
  const key = "test-key";
  const t0 = 1_000_000;

  describe("正常系", () => {
    it("初回リクエストは許可される", () => {
      const result = checkRateLimit(key, config, t0);
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.remaining).toBe(2);
      }
    });

    it("上限以内の連続リクエストはすべて許可される", () => {
      checkRateLimit(key, config, t0);
      checkRateLimit(key, config, t0 + 1_000);
      const result = checkRateLimit(key, config, t0 + 2_000);
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.remaining).toBe(0);
      }
    });

    it("ウィンドウが過ぎると再びリクエストが許可される", () => {
      // t0 で上限まで消費
      checkRateLimit(key, config, t0);
      checkRateLimit(key, config, t0 + 1_000);
      checkRateLimit(key, config, t0 + 2_000);

      // 最初のリクエスト(t0)がウィンドウ外になった時刻（t0 + windowMs + 1ms）
      const t1 = t0 + config.windowMs + 1;
      const result = checkRateLimit(key, config, t1);
      expect(result.allowed).toBe(true);
    });
  });

  describe("異常系（レート超過）", () => {
    it("上限を超えたリクエストは拒否される", () => {
      checkRateLimit(key, config, t0);
      checkRateLimit(key, config, t0 + 1_000);
      checkRateLimit(key, config, t0 + 2_000);

      const result = checkRateLimit(key, config, t0 + 3_000);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.remaining).toBe(0);
        expect(result.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it("retryAfterMs は最古タイムスタンプ + windowMs - nowMs に等しい", () => {
      checkRateLimit(key, config, t0);
      checkRateLimit(key, config, t0 + 1_000);
      checkRateLimit(key, config, t0 + 2_000);

      const now = t0 + 5_000;
      const result = checkRateLimit(key, config, now);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        // 最古タイムスタンプは t0 → t0 + 60000 - now = 55000
        expect(result.retryAfterMs).toBe(t0 + config.windowMs - now);
      }
    });
  });

  describe("境界値", () => {
    it("ウィンドウの境界ちょうど（windowMs 前のタイムスタンプ）は有効期限切れ扱いになる", () => {
      // t0 に記録したタイムスタンプが windowMs ちょうど後にはウィンドウ外になるか確認
      checkRateLimit(key, config, t0);
      checkRateLimit(key, config, t0 + 1_000);
      checkRateLimit(key, config, t0 + 2_000);

      // t0 + windowMs の時点では t0 は期限切れ（windowStart = t0 + windowMs - windowMs = t0 なので
      // タイムスタンプ > windowStart の条件を満たさない = 除外される）
      const tEdge = t0 + config.windowMs;
      const result = checkRateLimit(key, config, tEdge);
      expect(result.allowed).toBe(true);
    });

    it("maxRequests=1 の設定では 2 回目から拒否される", () => {
      const strictConfig: RateLimitConfig = {
        windowMs: 60_000,
        maxRequests: 1,
      };
      checkRateLimit(key, strictConfig, t0);
      const result = checkRateLimit(key, strictConfig, t0 + 1_000);
      expect(result.allowed).toBe(false);
    });

    it("異なるキーは独立してカウントされる", () => {
      const keyA = "key-a";
      const keyB = "key-b";
      checkRateLimit(keyA, config, t0);
      checkRateLimit(keyA, config, t0 + 1_000);
      checkRateLimit(keyA, config, t0 + 2_000);
      // keyA は上限到達、keyB は独立しているため許可される
      const result = checkRateLimit(keyB, config, t0 + 3_000);
      expect(result.allowed).toBe(true);
    });
  });

  describe("DATASOURCE_REFRESH_RATE_LIMIT", () => {
    it("デフォルト設定は windowMs=60000, maxRequests=5", () => {
      expect(DATASOURCE_REFRESH_RATE_LIMIT.windowMs).toBe(60_000);
      expect(DATASOURCE_REFRESH_RATE_LIMIT.maxRequests).toBe(5);
    });
  });
});

describe("buildRefreshRateLimitKey", () => {
  it("userId と dataSourceId を組み合わせたキーを返す（正常系）", () => {
    expect(buildRefreshRateLimitKey("user1", "ds1")).toBe(
      "ds-refresh:user1:ds1",
    );
  });

  it("異なる userId は異なるキーになる（境界値）", () => {
    expect(buildRefreshRateLimitKey("userA", "ds1")).not.toBe(
      buildRefreshRateLimitKey("userB", "ds1"),
    );
  });

  it("異なる dataSourceId は異なるキーになる（境界値）", () => {
    expect(buildRefreshRateLimitKey("user1", "dsA")).not.toBe(
      buildRefreshRateLimitKey("user1", "dsB"),
    );
  });
});

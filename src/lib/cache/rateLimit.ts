/**
 * シンプルなインメモリ・レート制限（仕様書 FEAT-005 準拠）。
 *
 * 「短時間に連続して更新を要求すると制限がかかり、その旨が分かる」要件を
 * インメモリの sliding window で実現する。
 *
 * 設計上の制約:
 * - Node.js プロセス単位のメモリ（複数インスタンス間での共有は不可）。
 *   本番で複数 Pod を立てる場合は Upstash Redis 等の外部 KV への移行を検討すること。
 * - テスト容易性のため `Date.now` を受け取る純粋関数として実装する
 *   （`server-only` への依存なし）。
 *
 * キーの設計:
 *   `ds-refresh:{userId}:{dataSourceId}` — ユーザーとデータソースの組み合わせでレート制限する。
 *   同一ユーザーが異なるデータソースを更新する際には制限を共有しない。
 */

export type RateLimitEntry = {
  timestamps: number[];
};

/** プロセス単位のレート制限ストア */
const rateLimitStore = new Map<string, RateLimitEntry>();

export type RateLimitConfig = {
  /** ウィンドウ幅（ミリ秒） */
  windowMs: number;
  /** ウィンドウ内の最大リクエスト数 */
  maxRequests: number;
};

export const DATASOURCE_REFRESH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000, // 60 秒
  maxRequests: 5, // 1 分間に最大 5 回
};

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number; remaining: 0 };

/**
 * 指定されたキーに対してレート制限を適用する。
 *
 * @param key レート制限のキー（例: `ds-refresh:userId:dataSourceId`）
 * @param config ウィンドウ幅と最大リクエスト数の設定
 * @param nowMs 現在時刻（ミリ秒、テスト時はモックを注入）
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DATASOURCE_REFRESH_RATE_LIMIT,
  nowMs: number = Date.now(),
): RateLimitResult {
  const windowStart = nowMs - config.windowMs;
  const entry = rateLimitStore.get(key) ?? { timestamps: [] };

  // ウィンドウ外の古いタイムスタンプを除去（sliding window）
  const validTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (validTimestamps.length >= config.maxRequests) {
    // 最も古いタイムスタンプが期限切れになるまでの待機時間を計算する
    const oldestTs = Math.min(...validTimestamps);
    const retryAfterMs = oldestTs + config.windowMs - nowMs;
    rateLimitStore.set(key, { timestamps: validTimestamps });
    return {
      allowed: false,
      retryAfterMs: Math.max(0, retryAfterMs),
      remaining: 0,
    };
  }

  const newTimestamps = [...validTimestamps, nowMs];
  rateLimitStore.set(key, { timestamps: newTimestamps });
  return {
    allowed: true,
    remaining: config.maxRequests - newTimestamps.length,
  };
}

/**
 * テスト用にレート制限ストアを全クリアする。
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * データソースリフレッシュ用のレート制限キーを生成する。
 */
export function buildRefreshRateLimitKey(
  userId: string,
  dataSourceId: string,
): string {
  return `ds-refresh:${userId}:${dataSourceId}`;
}

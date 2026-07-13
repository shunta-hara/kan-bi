/**
 * シングルフライト制御（仕様書 FEAT-005「同時に複数の利用者・画面から同じデータへアクセスしても、
 * 元のシートへの問い合わせが過剰に発生しない」に対応）。
 *
 * 同一キーに対して進行中のリクエストが存在する間は、後続のリクエストを新規に発行せず
 * 既存の Promise に相乗りさせる（deduplication）。
 *
 * - `server-only` / 外部 API クライアントに依存しない純粋な実装なので
 *   ユニットテストから直接検証できる。
 * - プロセス単位のシングルトン。複数インスタンス間での共有は Upstash Redis 等への移行が必要。
 */

/** 進行中のリクエストを保持するマップ */
const inFlightMap = new Map<string, Promise<unknown>>();

/**
 * 指定されたキーで fn を実行する。同一キーでの並行実行がある場合は fn を新規発行せず
 * 既存の Promise を返す（single-flight パターン）。
 *
 * @param key 重複排除のキー（例: `ds-fetch:{dataSourceId}`）
 * @param fn 実際の非同期処理
 */
export async function singleFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlightMap.get(key);
  if (existing !== undefined) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlightMap.delete(key);
  });

  inFlightMap.set(key, promise);
  return promise;
}

/**
 * テスト用に進行中マップをクリアする。
 */
export function clearSingleFlightMap(): void {
  inFlightMap.clear();
}

/**
 * データソースフェッチ用のシングルフライトキーを生成する。
 */
export function buildFetchSingleFlightKey(dataSourceId: string): string {
  return `ds-fetch:${dataSourceId}`;
}

import { z } from "zod";

/**
 * データソース（スプレッドシート連携）関連の Zod スキーマ集約モジュール。
 *
 * - `server-only` / `prisma` クライアントの初期化に依存しないため、
 *   ユニットテストから安全に import できる（.claude/rules/typescript.md, [[feedback-server-only-testability]]）。
 * - `spreadsheetId` / `range` / `columnTypes` の形式チェックをここに集約する
 *   （.claude/rules/typescript.md: 「同じ型を複数箇所で再定義しない」）。
 */

// ─────────────────────────────────────────────
// spreadsheetId / URL
// ─────────────────────────────────────────────

// Google スプレッドシートの ID は URL セーフな文字（英数字・ハイフン・アンダースコア）で構成される。
const SPREADSHEET_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const spreadsheetIdSchema = z
  .string()
  .trim()
  .min(1, { message: "spreadsheetId is required" })
  .regex(SPREADSHEET_ID_PATTERN, {
    message: "spreadsheetId contains invalid characters",
  });

/**
 * Google スプレッドシートの URL（または ID そのもの）から `spreadsheetId` を抽出する。
 *
 * 対応する形式:
 *   - https://docs.google.com/spreadsheets/d/<id>/edit#gid=0
 *   - https://docs.google.com/spreadsheets/d/<id>
 *   - https://docs.google.com/spreadsheets/d/<id>/
 *   - <id> をそのまま渡した場合（URL でなければ ID とみなす）
 *
 * 抽出に失敗した場合は `null` を返す（呼び出し側で Zod エラーに変換する）。
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/,
  );
  if (urlMatch) {
    return urlMatch[1];
  }

  // URL 形式でなければ「ID をそのまま入力した」とみなす
  if (SPREADSHEET_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * ユーザー入力（URL または ID）を受け取り、`spreadsheetId` を Zod で検証する高レベルスキーマ。
 * フォーム入力やAPI入力の境界で使用する。
 */
export const spreadsheetUrlOrIdSchema = z
  .string()
  .trim()
  .min(1, { message: "spreadsheetUrl is required" })
  .transform((value, ctx) => {
    const id = extractSpreadsheetId(value);
    if (!id) {
      ctx.addIssue({
        code: "custom",
        message:
          "Could not extract a spreadsheetId from the provided URL or ID",
      });
      return z.NEVER;
    }
    const parsed = spreadsheetIdSchema.safeParse(id);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Invalid spreadsheetId format" });
      return z.NEVER;
    }
    return parsed.data;
  });

// ─────────────────────────────────────────────
// range（例: "Sheet1!A1:F100"、シート名のみも可）
// ─────────────────────────────────────────────

const A1_RANGE_PATTERN = /^[A-Za-z]+[1-9][0-9]*(?::[A-Za-z]+[1-9][0-9]*)?$/;
// シート名: 空文字・先頭/末尾の空白・` ' [ ] * ? / \ ` を含まない（A1記法の制約に準拠した簡易チェック）
const SHEET_NAME_PATTERN = /^[^'\]\[*?/\\:]+$/;

export type ParsedRange = {
  sheetName: string | null;
  cellRange: string | null;
};

/**
 * `range` 文字列を `シート名` と `セル範囲（A1記法）` に分解する。
 * - "Sheet1!A1:F100" → { sheetName: "Sheet1", cellRange: "A1:F100" }
 * - "Sheet1" → { sheetName: "Sheet1", cellRange: null }
 * - "A1:F100" → { sheetName: null, cellRange: "A1:F100" }
 *
 * 形式が不正な場合は `null` を返す。
 */
export function parseRange(input: string): ParsedRange | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("!")) {
    const [sheetPart, ...rest] = trimmed.split("!");
    const cellPart = rest.join("!").trim();
    const sheetName = sheetPart.trim();

    if (!sheetName || !SHEET_NAME_PATTERN.test(sheetName)) return null;
    if (!cellPart) return { sheetName, cellRange: null };
    if (!A1_RANGE_PATTERN.test(cellPart)) return null;

    return { sheetName, cellRange: cellPart };
  }

  // "!" を含まない場合: A1記法のセル範囲か、シート名のいずれか。
  // "Sheet1" のような単一トークンは「単一セル参照」とも「シート名」とも解釈できて
  // 曖昧なため、コロンを含む（=複数セルにまたがる範囲）場合のみセル範囲として扱い、
  // それ以外はシート名として解釈する（"Sheet1" → シート名、"A1:F100" → セル範囲）。
  if (trimmed.includes(":")) {
    if (A1_RANGE_PATTERN.test(trimmed)) {
      return { sheetName: null, cellRange: trimmed };
    }
    return null;
  }

  if (SHEET_NAME_PATTERN.test(trimmed)) {
    return { sheetName: trimmed, cellRange: null };
  }

  return null;
}

export const rangeSchema = z
  .string()
  .trim()
  .min(1, { message: "range is required" })
  .max(200, { message: "range is too long" })
  .refine((value) => parseRange(value) !== null, {
    message: 'range must look like "Sheet1!A1:F100", "Sheet1", or "A1:F100"',
  });

// ─────────────────────────────────────────────
// authMode / syncStatus / 列型
// ─────────────────────────────────────────────

export const authModeSchema = z.enum(["OAUTH", "PUBLIC"]);
export type AuthMode = z.infer<typeof authModeSchema>;

/**
 * データソースの同期ステータス（FEAT-005 / FEAT-006）。
 * - IDLE: 一度も同期されていない初期状態
 * - SYNCING: 現在同期中
 * - OK: 最後の同期が成功
 * - ERROR: 最後の同期がエラー（一時的なネットワーク障害等）
 * - REAUTH_REQUIRED: Google アクセス権が失効。再認可が必要
 */
export const syncStatusSchema = z.enum([
  "IDLE",
  "SYNCING",
  "OK",
  "ERROR",
  "REAUTH_REQUIRED",
]);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const columnDataTypeSchema = z.enum(["number", "date", "string"]);
export type ColumnDataType = z.infer<typeof columnDataTypeSchema>;

/**
 * 列型の手動オーバーライド（`DataSource.columnTypes` の Json 永続化形式）。
 * キー: 列名、値: ユーザーが指定した型。
 * DB の `Json?` は必ずこのスキーマでパースしてから扱う（.claude/rules/typescript.md）。
 */
export const columnTypeOverridesSchema = z.record(
  z.string(),
  columnDataTypeSchema,
);
export type ColumnTypeOverrides = z.infer<typeof columnTypeOverridesSchema>;

/**
 * `DataSource.columnTypes`（`Json?`）を安全にパースする。
 * 不正な値（レコード破損・手動編集等）の場合は空オブジェクトとして扱う。
 */
export function parseColumnTypeOverrides(value: unknown): ColumnTypeOverrides {
  if (value === null || value === undefined) return {};
  const parsed = columnTypeOverridesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

// ─────────────────────────────────────────────
// 列推定結果 / プレビュー
// ─────────────────────────────────────────────

export const inferredColumnSchema = z.object({
  name: z.string(),
  inferredType: columnDataTypeSchema,
});
export type InferredColumn = z.infer<typeof inferredColumnSchema>;

export const previewResultSchema = z.object({
  columns: z.array(inferredColumnSchema),
  rows: z.array(z.array(z.string())),
  totalRowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type PreviewResult = z.infer<typeof previewResultSchema>;

// ─────────────────────────────────────────────
// データソース登録入力
// ─────────────────────────────────────────────

export const dataSourceNameSchema = z
  .string()
  .trim()
  .min(1, { message: "name is required" })
  .max(120, { message: "name is too long" });

/**
 * `POST /api/datasources` の入力スキーマ。
 * Sprint 2 では公開シート（`PUBLIC` / gviz CSV）取得を主に実装するため `authMode` は
 * 既定で `PUBLIC` とするが、OAuth 経路（`OAUTH`）も将来の増分スコープ実装に備えて
 * 受け付け可能にしておく（実際の取得ロジックは [[lib-sheets-fetchPreview]] 参照）。
 */
export const createDataSourceInputSchema = z.object({
  name: dataSourceNameSchema,
  spreadsheetUrl: spreadsheetUrlOrIdSchema,
  range: rangeSchema,
  authMode: authModeSchema.default("PUBLIC"),
  refreshIntervalSec: z
    .number()
    .int()
    .min(60, { message: "refreshIntervalSec must be at least 60 seconds" })
    .max(86_400, { message: "refreshIntervalSec must be at most 1 day" })
    .default(300),
});
export type CreateDataSourceInput = z.infer<typeof createDataSourceInputSchema>;

/**
 * `POST /api/datasources/preview` の入力スキーマ（登録前のプレビュー取得）。
 * 名称や更新間隔はまだ確定していない段階なので、取得に必要な項目のみを要求する。
 */
export const previewDataSourceInputSchema = z.object({
  spreadsheetUrl: spreadsheetUrlOrIdSchema,
  range: rangeSchema,
  authMode: authModeSchema.default("PUBLIC"),
});
export type PreviewDataSourceInput = z.infer<
  typeof previewDataSourceInputSchema
>;

// ─────────────────────────────────────────────
// データソース更新入力（FEAT-003 編集 / FEAT-004 列型オーバーライド）
// ─────────────────────────────────────────────

/**
 * `PATCH /api/datasources/:id` の入力スキーマ。
 *
 * - すべて任意項目（部分更新）。`spreadsheetUrl` / `authMode` は接続元の差し替えに
 *   相当し再設計が必要になるため Sprint 3 では対象外とし、名称・読み込み範囲・
 *   更新間隔・列型オーバーライドのみ更新できる。
 * - 何も指定されていない更新リクエストは `refine` で reject し、空更新を防ぐ
 *   （境界値: 「最低1項目は指定する」）。
 * - `columnTypes` は `null` を渡すことでオーバーライドを全解除できる。
 */
export const updateDataSourceInputSchema = z
  .object({
    name: dataSourceNameSchema.optional(),
    range: rangeSchema.optional(),
    refreshIntervalSec: z
      .number()
      .int()
      .min(60, { message: "refreshIntervalSec must be at least 60 seconds" })
      .max(86_400, { message: "refreshIntervalSec must be at most 1 day" })
      .optional(),
    columnTypes: columnTypeOverridesSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.range !== undefined ||
      value.refreshIntervalSec !== undefined ||
      value.columnTypes !== undefined,
    { message: "At least one field must be provided for update" },
  );
export type UpdateDataSourceInput = z.infer<typeof updateDataSourceInputSchema>;

// ─────────────────────────────────────────────
// 取得エラー（原因の分かるエラー表示のための分類）
// ─────────────────────────────────────────────

export const sheetFetchErrorCodeSchema = z.enum([
  "INVALID_RANGE",
  "NOT_FOUND",
  "FORBIDDEN",
  "PARSE_ERROR",
  "EMPTY_RESULT",
  "NETWORK_ERROR",
  "REAUTH_REQUIRED",
  "UNKNOWN",
]);
export type SheetFetchErrorCode = z.infer<typeof sheetFetchErrorCodeSchema>;

// ─────────────────────────────────────────────
// API レスポンス（クライアントコンポーネントからの解析用）
// ─────────────────────────────────────────────

/**
 * `/api/datasources*` のエラーレスポンス共通形。`code` は `SheetFetchErrorCode` に
 * 加えて、API 層固有のコード（認証・検証エラー等）も取り得るため文字列として扱い、
 * UI 側では i18n のキーに存在しない場合のフォールバックを用意する。
 */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const previewApiResponseSchema = z.object({
  data: previewResultSchema,
  spreadsheetId: spreadsheetIdSchema,
});
export type PreviewApiResponse = z.infer<typeof previewApiResponseSchema>;

/**
 * 一覧・詳細表示で共通して使う「利用状況」情報。
 * 「使用中のデータソースは直接削除できない」（FEAT-003）の判定・表示に用いる。
 */
export const dataSourceUsageSchema = z.object({
  widgetCount: z.number().int().nonnegative(),
  dashboardCount: z.number().int().nonnegative(),
});
export type DataSourceUsage = z.infer<typeof dataSourceUsageSchema>;

/**
 * 利用状況から「直接削除できるか」を判定する純粋関数。
 * ルート/UI の双方から参照し、判定基準を一箇所に集約する
 * （.claude/rules/typescript.md: 「同じ型を複数箇所で再定義しない」の精神を判定ロジックにも適用）。
 */
export function canDeleteDataSource(usage: DataSourceUsage): boolean {
  return usage.widgetCount === 0;
}

export const dataSourceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  spreadsheetId: z.string(),
  range: z.string(),
  authMode: authModeSchema,
  refreshIntervalSec: z.number().int(),
  columnTypes: columnTypeOverridesSchema,
  usage: dataSourceUsageSchema,
  syncStatus: syncStatusSchema,
  lastSyncedAt: z.coerce.date().nullable(),
  lastSyncError: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DataSourceSummary = z.infer<typeof dataSourceSummarySchema>;

export const createDataSourceApiResponseSchema = z.object({
  data: dataSourceSummarySchema,
});
export type CreateDataSourceApiResponse = z.infer<
  typeof createDataSourceApiResponseSchema
>;

export const listDataSourcesApiResponseSchema = z.object({
  data: z.array(dataSourceSummarySchema),
});
export type ListDataSourcesApiResponse = z.infer<
  typeof listDataSourcesApiResponseSchema
>;

/**
 * `GET /api/datasources/:id` のレスポンス。
 * 一覧情報に加えて、現在の列推定結果（オーバーライド適用後）とプレビュー行を含み、
 * 編集画面で「上書きした型がデータの表示に反映される」ことをその場で確認できるようにする
 * （FEAT-004 受け入れ基準）。
 */
export const dataSourceDetailSchema = dataSourceSummarySchema.extend({
  preview: previewResultSchema,
});
export type DataSourceDetail = z.infer<typeof dataSourceDetailSchema>;

export const dataSourceDetailApiResponseSchema = z.object({
  data: dataSourceDetailSchema,
});
export type DataSourceDetailApiResponse = z.infer<
  typeof dataSourceDetailApiResponseSchema
>;

export const updateDataSourceApiResponseSchema = z.object({
  data: dataSourceSummarySchema,
});
export type UpdateDataSourceApiResponse = z.infer<
  typeof updateDataSourceApiResponseSchema
>;

/**
 * `DELETE /api/datasources/:id` が使用中のため拒否したときのエラー詳細。
 * UI 側で「どのくらい使われているか」を含めて理由を説明できるようにする。
 */
export const dataSourceInUseErrorSchema = z.object({
  error: z.object({
    code: z.literal("DATA_SOURCE_IN_USE"),
    message: z.string(),
    usage: dataSourceUsageSchema,
  }),
});
export type DataSourceInUseError = z.infer<typeof dataSourceInUseErrorSchema>;

/**
 * `POST /api/datasources/:id/refresh` のレスポンス。
 * リフレッシュ後の最新のデータソース情報（syncStatus / lastSyncedAt を含む）を返す。
 */
export const refreshDataSourceApiResponseSchema = z.object({
  data: dataSourceSummarySchema,
});
export type RefreshDataSourceApiResponse = z.infer<
  typeof refreshDataSourceApiResponseSchema
>;

/**
 * レート制限エラーのレスポンス。
 * `Retry-After` に相当する待機時間（秒）を含め、UI 側で「何秒後に再試行できるか」を示せるようにする。
 */
export const rateLimitErrorSchema = z.object({
  error: z.object({
    code: z.literal("RATE_LIMITED"),
    message: z.string(),
    retryAfterSec: z.number().int().nonnegative(),
  }),
});
export type RateLimitError = z.infer<typeof rateLimitErrorSchema>;

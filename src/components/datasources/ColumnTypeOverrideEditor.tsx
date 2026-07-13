import type { ColumnDataType, InferredColumn } from "@/lib/sheets/schema";

export type ColumnTypeOverrideEditorMessages = {
  heading: string;
  description: string;
  columnNameHeading: string;
  estimatedTypeHeading: string;
  overrideTypeHeading: string;
  estimatedBadge: string;
  overriddenBadge: string;
  typeLabels: Record<ColumnDataType, string>;
  useEstimatedOption: string;
};

type ColumnTypeOverrideEditorProps = {
  columns: InferredColumn[];
  /**
   * 列名 → 上書き型。キーが存在しない列は「推定値を使用」を表す。
   * （`undefined` は「未選択」と区別するため、明示的に省略している列のみ含む）
   */
  overrides: Partial<Record<string, ColumnDataType>>;
  onChange: (columnName: string, type: ColumnDataType | null) => void;
  messages: ColumnTypeOverrideEditorMessages;
};

const COLUMN_DATA_TYPES: ColumnDataType[] = ["string", "number", "date"];

/**
 * 列ごとの推定型を表示し、手動で上書きできるようにする編集 UI（表示専用 + イベント発火）。
 *
 * - 各列について「推定された型」と「上書き後の型（プルダウン）」を並べて表示する
 *   （FEAT-004 受け入れ基準「各列に推定された型がプレビューで表示される」
 *   「任意の列について型を手動で変更できる」）。
 * - 選択状態の保持・保存 API 呼び出しは親（`EditDataSourcePanel`）が担当する
 *   （.claude/rules/architecture.md: 表示とデータ取得・状態管理の分離）。
 */
export function ColumnTypeOverrideEditor({
  columns,
  overrides,
  onChange,
  messages,
}: ColumnTypeOverrideEditorProps) {
  return (
    <section
      aria-labelledby="column-type-override-heading"
      className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <div className="flex flex-col gap-1">
        <h4 id="column-type-override-heading" className="font-medium">
          {messages.heading}
        </h4>
        <p className="text-sm text-black/60 dark:text-white/60">
          {messages.description}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <caption className="sr-only">{messages.heading}</caption>
          <thead>
            <tr className="bg-black/[.03] dark:bg-white/[.06]">
              <th
                scope="col"
                className="border-b border-black/10 px-3 py-2 text-left font-medium dark:border-white/15"
              >
                {messages.columnNameHeading}
              </th>
              <th
                scope="col"
                className="border-b border-black/10 px-3 py-2 text-left font-medium dark:border-white/15"
              >
                {messages.estimatedTypeHeading}
              </th>
              <th
                scope="col"
                className="border-b border-black/10 px-3 py-2 text-left font-medium dark:border-white/15"
              >
                {messages.overrideTypeHeading}
              </th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => {
              const overriddenType = overrides[column.name];
              const selectId = `column-type-override-${column.name}`;

              return (
                <tr key={column.name}>
                  <td className="border-b border-black/5 px-3 py-2 font-medium dark:border-white/10">
                    {column.name}
                  </td>
                  <td className="border-b border-black/5 px-3 py-2 dark:border-white/10">
                    <span className="rounded-full bg-black/[.06] px-2 py-0.5 text-xs text-black/60 dark:bg-white/[.08] dark:text-white/60">
                      {messages.typeLabels[column.inferredType]}
                    </span>
                  </td>
                  <td className="border-b border-black/5 px-3 py-2 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <label htmlFor={selectId} className="sr-only">
                        {messages.overrideTypeHeading} — {column.name}
                      </label>
                      <select
                        id={selectId}
                        value={overriddenType ?? ""}
                        onChange={(event) => {
                          const { value } = event.target;
                          if (value === "") {
                            onChange(column.name, null);
                            return;
                          }
                          onChange(column.name, value as ColumnDataType);
                        }}
                        className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-black outline-none focus:border-black/40 dark:border-white/20 dark:bg-neutral-900 dark:text-white dark:focus:border-white/50"
                      >
                        <option value="">{messages.useEstimatedOption}</option>
                        {COLUMN_DATA_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {messages.typeLabels[type]}
                          </option>
                        ))}
                      </select>
                      {overriddenType ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          {messages.overriddenBadge}
                        </span>
                      ) : (
                        <span className="rounded-full bg-black/[.04] px-2 py-0.5 text-xs text-black/40 dark:bg-white/[.06] dark:text-white/60">
                          {messages.estimatedBadge}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

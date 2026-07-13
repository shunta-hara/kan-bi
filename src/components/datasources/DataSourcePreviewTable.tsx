import type { PreviewResult } from "@/lib/sheets/schema";

type PreviewMessages = {
  heading: string;
  columnsHeading: string;
  rowsHeading: (count: number) => string;
  totalRowCount: (count: number) => string;
  truncatedNote: (count: number) => string;
  typeLabels: Record<PreviewResult["columns"][number]["inferredType"], string>;
  emptyRows: string;
};

type DataSourcePreviewTableProps = {
  preview: PreviewResult;
  messages: PreviewMessages;
};

/**
 * 登録前プレビュー表示（表示専用コンポーネント）。
 *
 * - 列名・推定型・先頭数行のデータを表形式で示す（仕様書 FEAT-002）。
 * - 状態管理は親（`RegisterDataSourceForm`）に置き、ここでは描画のみを担当する
 *   （.claude/rules/architecture.md: 「データ取得・状態管理」と「表示」を分離する）。
 */
export function DataSourcePreviewTable({
  preview,
  messages,
}: DataSourcePreviewTableProps) {
  return (
    <section
      aria-labelledby="datasource-preview-heading"
      className="flex flex-col gap-4 rounded-xl border border-black/10 p-5 dark:border-white/15"
    >
      <div className="flex flex-col gap-1">
        <h3 id="datasource-preview-heading" className="font-medium">
          {messages.heading}
        </h3>
        <p className="text-sm text-black/60 dark:text-white/60">
          {messages.totalRowCount(preview.totalRowCount)}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-black/70 dark:text-white/70">
          {messages.columnsHeading}
        </h4>
        <ul className="flex flex-wrap gap-2">
          {preview.columns.map((column) => (
            <li
              key={column.name}
              className="flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/15"
            >
              <span className="font-medium">{column.name}</span>
              <span className="rounded-full bg-black/[.06] px-2 py-0.5 text-black/60 dark:bg-white/[.08] dark:text-white/60">
                {messages.typeLabels[column.inferredType]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-black/70 dark:text-white/70">
          {messages.rowsHeading(preview.rows.length)}
        </h4>

        {preview.rows.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            {messages.emptyRows}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <caption className="sr-only">{messages.heading}</caption>
              <thead>
                <tr className="bg-black/[.03] dark:bg-white/[.06]">
                  {preview.columns.map((column) => (
                    <th
                      key={column.name}
                      scope="col"
                      className="border-b border-black/10 px-3 py-2 text-left font-medium dark:border-white/15"
                    >
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="even:bg-black/[.02] dark:even:bg-white/[.03]"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-black/5 px-3 py-2 dark:border-white/10"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {preview.truncated ? (
          <p className="text-xs text-black/50 dark:text-white/60">
            {messages.truncatedNote(preview.rows.length)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

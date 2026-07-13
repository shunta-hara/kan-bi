type DashboardListEmptyStateProps = {
  title: string;
  description: string;
  createLabel: string;
};

/**
 * ダッシュボードが1件もないときの空状態表示（表示専用）。
 * 新規作成機能自体は Sprint 5（FEAT-007）で実装するため、ここではボタンを
 * 無効状態のプレースホルダーとして表示し、導線の存在のみを示す。
 */
export function DashboardListEmptyState({
  title,
  description,
  createLabel,
}: DashboardListEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-black/15 p-12 text-center dark:border-white/20">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          {description}
        </p>
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={createLabel}
        className="cursor-not-allowed rounded-full bg-foreground/40 px-5 py-2.5 text-sm font-medium text-background"
      >
        {createLabel}
      </button>
    </div>
  );
}

/**
 * AddWidgetDialog コンポーネントのテスト（FEAT-BF-004）。
 *
 * テスト対象: 成功後の再開放時に useActionState がリセットされること（key prop パターン）。
 * - このコンポーネントは next-intl や server-only を依存しないため、jsdom で直接テスト可能。
 * - @testing-library/react + React 19 (useActionState) の組み合わせで検証する。
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddWidgetDialog } from "@/components/dashboard/AddWidgetDialog";

// AddWidgetState のローカル定義（server-only な widgetActions.ts のランタイム評価を避けるため）
type AddWidgetState =
  | { status: "idle" }
  | { status: "success"; widgetId: string }
  | { status: "error"; code: string; message: string };

const MOCK_CHART_TYPES: Record<string, string> = {
  bar: "Bar Chart",
  line: "Line Chart",
  area: "Area Chart",
  pie: "Pie Chart",
  donut: "Donut Chart",
  scatter: "Scatter Plot",
  bubble: "Bubble Chart",
  radar: "Radar Chart",
  heatmap: "Heatmap",
  gauge: "Gauge",
  treemap: "Treemap",
  funnel: "Funnel",
  kpi: "KPI Card",
  table: "Table",
};

const MOCK_LABELS = {
  title: "Add Widget",
  chartTypeLabel: "Chart type",
  titleLabel: "Title",
  titlePlaceholder: "e.g. My Chart",
  dataSourceLabel: "Data source",
  dataSourceNone: "None",
  submitButton: "Add",
  submittingButton: "Adding…",
  cancelButton: "Cancel",
  chartTypes: MOCK_CHART_TYPES,
};

// ダミーのアクション（何もしない）
const idleAction = vi.fn(
  async (
    _prev: AddWidgetState,
    _formData: FormData,
  ): Promise<AddWidgetState> => ({ status: "idle" }),
);

describe("AddWidgetDialog", () => {
  // ──────────────────────────────────────────
  // 正常系: 表示制御
  // ──────────────────────────────────────────

  describe("正常系: 表示制御", () => {
    it("open=false のとき何もレンダリングしない（境界値: 非表示状態）", () => {
      const { container } = render(
        <AddWidgetDialog
          open={false}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("open=true のときダイアログタイトルが表示される", () => {
      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );
      expect(screen.getByText("Add Widget")).toBeInTheDocument();
    });

    it("初期表示でエラーメッセージが表示されない（idle 状態）", () => {
      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 正常系: キャンセル操作
  // ──────────────────────────────────────────

  describe("正常系: キャンセル操作", () => {
    it("キャンセルボタンを押すと onClose が呼ばれる", () => {
      const onClose = vi.fn();
      render(
        <AddWidgetDialog
          open={true}
          onClose={onClose}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );
      fireEvent.click(screen.getByText("Cancel"));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("オーバーレイ部分のクリックで onClose が呼ばれる", () => {
      const onClose = vi.fn();
      const { container } = render(
        <AddWidgetDialog
          open={true}
          onClose={onClose}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );
      // 最外側の overlay div（fixed inset-0 の div）を取得してクリック
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // ──────────────────────────────────────────
  // 正常系: アクション結果によるエラー表示
  // ──────────────────────────────────────────

  describe("正常系: アクション失敗時のエラー表示", () => {
    it("アクションが error を返したときエラーメッセージが表示される", async () => {
      const errorMessage = "Widget creation failed";
      const failAction = vi.fn(async (): Promise<AddWidgetState> => ({
        status: "error",
        code: "VALIDATION_ERROR",
        message: errorMessage,
      }));

      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={failAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Add"));
      });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it("エラー時に onClose は呼ばれない", async () => {
      const onClose = vi.fn();
      const failAction = vi.fn(async (): Promise<AddWidgetState> => ({
        status: "error",
        code: "UNKNOWN",
        message: "Unknown error",
      }));

      render(
        <AddWidgetDialog
          open={true}
          onClose={onClose}
          addWidgetAction={failAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Add"));
      });

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // 正常系: 成功後の自動クローズ
  // ──────────────────────────────────────────

  describe("正常系: アクション成功時の自動クローズ", () => {
    it("アクションが success を返したとき onClose が呼ばれる", async () => {
      const onClose = vi.fn();
      const successAction = vi.fn(async (): Promise<AddWidgetState> => ({
        status: "success",
        widgetId: "widget-001",
      }));

      render(
        <AddWidgetDialog
          open={true}
          onClose={onClose}
          addWidgetAction={successAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Add"));
      });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce();
      });
    });
  });

  // ──────────────────────────────────────────
  // 境界値: key によるリセット（FEAT-BF-004 コアテスト）
  // ──────────────────────────────────────────

  describe("境界値: key によるリセット（FEAT-BF-004）", () => {
    it("コンポーネントが再マウントされると常に idle 状態で開始される", () => {
      /**
       * この挙動が FEAT-BF-004 の修正の根拠。
       * DashboardDetailClient が key={dialogKey} を AddWidgetDialog に渡すことで、
       * ダイアログを開くたびにコンポーネントがリマウントされ useActionState がリセットされる。
       */
      const { unmount } = render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      unmount();

      // 新しいインスタンスとして再マウント（key が変わった状態をシミュレート）
      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      // 再マウント後も idle 状態（エラーなし）
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("エラーが発生した後に再マウントするとエラーメッセージが消える", async () => {
      const errorMessage = "Previous error message";
      const failAction = vi.fn(async (): Promise<AddWidgetState> => ({
        status: "error",
        code: "UNKNOWN",
        message: errorMessage,
      }));

      const { unmount } = render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={failAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      // エラーを発生させる
      await act(async () => {
        fireEvent.click(screen.getByText("Add"));
      });
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      unmount();

      // 再マウント（key=N+1 でリマウントした状態をシミュレート）
      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      // 前のエラーメッセージが表示されない
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 正常系: データソース選択肢
  // ──────────────────────────────────────────

  describe("正常系: データソース選択肢の表示", () => {
    it("データソースが空のとき「None」の選択肢のみが表示される（境界値: 0件）", () => {
      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={[]}
          labels={MOCK_LABELS}
        />,
      );

      const select = screen.getByLabelText("Data source");
      expect(select).toBeInTheDocument();
      expect(screen.getByText("None")).toBeInTheDocument();
    });

    it("データソースが複数存在するとき選択肢に表示される", () => {
      const dataSources = [
        { id: "ds-1", name: "Sales Sheet" },
        { id: "ds-2", name: "Users Sheet" },
      ];
      render(
        <AddWidgetDialog
          open={true}
          onClose={vi.fn()}
          addWidgetAction={idleAction}
          dataSources={dataSources}
          labels={MOCK_LABELS}
        />,
      );

      expect(screen.getByText("Sales Sheet")).toBeInTheDocument();
      expect(screen.getByText("Users Sheet")).toBeInTheDocument();
    });
  });
});

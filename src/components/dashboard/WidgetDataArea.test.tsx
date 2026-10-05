/**
 * WidgetDataArea コンポーネントのテスト（FEAT-BF-003）。
 *
 * テスト対象: データ取得状態（ok / no_datasource / error）に応じた描画の切り替え。
 *
 * - next-intl の useTranslations を vi.mock でモック。
 * - ChartWidget を vi.mock でモックし、レンダリング内容を単体で検証する。
 * - 正常系・異常系・境界値（未知の errorCode でも汎用エラー表示）を網羅。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WidgetDataArea } from "@/components/dashboard/WidgetDataArea";
import type { WidgetDataStatus, WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

// ─────────────────────────────────────────────
// モック
// ─────────────────────────────────────────────

// next-intl の useTranslations をモック。
// 翻訳キーをそのまま返すことで、テスト内でキー名を直接 assert できる。
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ChartWidget を軽量なスタブに差し替える。
// WidgetDataArea のテスト目的はデータ取得状態の分岐であり、
// ECharts の描画そのものはここでは検証しない。
vi.mock("@/components/charts/ChartWidget", () => ({
  ChartWidget: ({ title }: { title: string }) => (
    <div data-testid="chart-widget">{title}</div>
  ),
}));

// ─────────────────────────────────────────────
// フィクスチャ
// ─────────────────────────────────────────────

const MOCK_CONFIG: WidgetConfig = {
  chartType: "bar",
  showLegend: true,
  showLabels: false,
  schemaVersion: 1,
};

const MOCK_QUERY_RESULT: QueryResult = {
  groupByColumn: "category",
  categories: ["A", "B"],
  rows: [
    { key: "A", values: { count: 10 } },
    { key: "B", values: { count: 20 } },
  ],
  measureNames: ["count"],
};

// ─────────────────────────────────────────────
// テストスイート
// ─────────────────────────────────────────────

describe("WidgetDataArea", () => {
  // ──────────────────────────────────────────
  // 正常系: ok 状態
  // ──────────────────────────────────────────

  describe("正常系: status=ok", () => {
    it("status=ok かつ queryResult がある場合 ChartWidget が描画される", () => {
      const dataStatus: WidgetDataStatus = { status: "ok" };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={MOCK_QUERY_RESULT}
          title="売上グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByTestId("chart-widget")).toBeInTheDocument();
      expect(screen.getByText("売上グラフ")).toBeInTheDocument();
    });

    it("ChartWidget にタイトルが渡される", () => {
      const dataStatus: WidgetDataStatus = { status: "ok" };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={MOCK_QUERY_RESULT}
          title="月別売上"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByText("月別売上")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 異常系: status=ok だが queryResult が null
  // ──────────────────────────────────────────

  describe("境界値: status=ok + queryResult=null", () => {
    it("queryResult が null のとき ChartWidget は描画されずデータソース未設定表示になる", () => {
      const dataStatus: WidgetDataStatus = { status: "ok" };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
      // no_datasource 状態と同じく status="status" の要素が表示される
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 正常系: no_datasource 状態
  // ──────────────────────────────────────────

  describe("正常系: status=no_datasource", () => {
    it("データソース未設定メッセージが表示される", () => {
      const dataStatus: WidgetDataStatus = { status: "no_datasource" };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      // useTranslations モックはキーをそのまま返す
      expect(screen.getByText("noDataSourceMessage")).toBeInTheDocument();
    });

    it("役割 status の要素が表示される（アクセシビリティ）", () => {
      const dataStatus: WidgetDataStatus = { status: "no_datasource" };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("ChartWidget は描画されない", () => {
      const dataStatus: WidgetDataStatus = { status: "no_datasource" };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 異常系: error + REAUTH_REQUIRED
  // ──────────────────────────────────────────

  describe("異常系: status=error, code=REAUTH_REQUIRED", () => {
    it("再認可メッセージが表示される", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "REAUTH_REQUIRED",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByText("reauthRequiredMessage")).toBeInTheDocument();
    });

    it("データソース設定ページへのリンクが表示される", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "REAUTH_REQUIRED",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/datasources");
    });

    it("role=alert の要素が表示される（アクセシビリティ）", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "REAUTH_REQUIRED",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("ChartWidget は描画されない", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "REAUTH_REQUIRED",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
    });

    it("汎用エラーメッセージ（fetchErrorMessage）は表示されない", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "REAUTH_REQUIRED",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.queryByText("fetchErrorMessage")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 異常系: error + その他コード
  // ──────────────────────────────────────────

  describe("異常系: status=error, code=FORBIDDEN", () => {
    it("汎用エラーメッセージが表示される", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "FORBIDDEN",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByText("fetchErrorMessage")).toBeInTheDocument();
    });

    it("role=alert の要素が表示される（アクセシビリティ）", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "FORBIDDEN",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("REAUTH_REQUIRED のメッセージやリンクは表示されない", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "FORBIDDEN",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(
        screen.queryByText("reauthRequiredMessage"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 境界値: 未知の errorCode でも汎用エラー表示
  // ──────────────────────────────────────────

  describe("境界値: 未知の errorCode", () => {
    it("未知の errorCode（UNKNOWN_XYZ 等）でも汎用エラーメッセージが表示される", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "UNKNOWN_XYZ",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByText("fetchErrorMessage")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("空文字の errorCode でも汎用エラーメッセージが表示される（境界値: 空文字）", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByText("fetchErrorMessage")).toBeInTheDocument();
      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
    });

    it("NETWORK_ERROR コードでも汎用エラーメッセージが表示される", () => {
      const dataStatus: WidgetDataStatus = {
        status: "error",
        code: "NETWORK_ERROR",
      };
      render(
        <WidgetDataArea
          dataStatus={dataStatus}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );

      expect(screen.getByText("fetchErrorMessage")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // 境界値: 各状態の視覚的区別
  // ──────────────────────────────────────────

  describe("境界値: 各状態の描画が視覚的に区別される", () => {
    it("ok 状態は ChartWidget を表示し、no_datasource とは描画が異なる", () => {
      const { rerender } = render(
        <WidgetDataArea
          dataStatus={{ status: "ok" }}
          queryResult={MOCK_QUERY_RESULT}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );
      expect(screen.getByTestId("chart-widget")).toBeInTheDocument();

      rerender(
        <WidgetDataArea
          dataStatus={{ status: "no_datasource" }}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );
      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("error(REAUTH) と error(OTHER) は異なる描画になる", () => {
      const { rerender } = render(
        <WidgetDataArea
          dataStatus={{ status: "error", code: "REAUTH_REQUIRED" }}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );
      expect(screen.getByText("reauthRequiredMessage")).toBeInTheDocument();
      expect(screen.getByRole("link")).toBeInTheDocument();

      rerender(
        <WidgetDataArea
          dataStatus={{ status: "error", code: "FORBIDDEN" }}
          queryResult={null}
          title="グラフ"
          config={MOCK_CONFIG}
        />,
      );
      expect(
        screen.queryByText("reauthRequiredMessage"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("fetchErrorMessage")).toBeInTheDocument();
    });
  });
});

/**
 * WidgetDataArea コンポーネントのテスト（FEAT-BF-003）。
 *
 * テスト対象: データ取得状態（ok / no_datasource / error）に応じた描画の切り替え。
 *
 * - next-intl の useTranslations は翻訳キーをそのまま返すモックに差し替える。
 * - ChartWidget は軽量スタブに差し替える（ECharts の描画自体は対象外）。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WidgetDataArea } from "@/components/dashboard/WidgetDataArea";
import type { WidgetDataStatus, WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/charts/ChartWidget", () => ({
  ChartWidget: ({ title }: { title: string }) => (
    <div data-testid="chart-widget">{title}</div>
  ),
}));

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

function renderArea(
  dataStatus: WidgetDataStatus,
  queryResult: QueryResult | null = null,
) {
  return render(
    <WidgetDataArea
      dataStatus={dataStatus}
      queryResult={queryResult}
      title="売上グラフ"
      config={MOCK_CONFIG}
    />,
  );
}

describe("WidgetDataArea", () => {
  describe("正常系: status=ok", () => {
    it("queryResult があれば ChartWidget にタイトルを渡して描画する", () => {
      renderArea({ status: "ok" }, MOCK_QUERY_RESULT);

      expect(screen.getByTestId("chart-widget")).toHaveTextContent(
        "売上グラフ",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("境界値: status=ok + queryResult=null", () => {
    it("ChartWidget は描画せず、データソース未設定表示にフォールバックする（現仕様）", () => {
      // サーバーが ok を返しても結果が無い場合は、エラーではなく未設定表示に倒す。
      renderArea({ status: "ok" }, null);

      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "noDataSourceMessage",
      );
    });
  });

  describe("status=no_datasource", () => {
    it("未設定メッセージを role=status で表示し、ChartWidget は描画しない", () => {
      renderArea({ status: "no_datasource" });

      expect(screen.getByRole("status")).toHaveTextContent(
        "noDataSourceMessage",
      );
      expect(screen.getByRole("status")).toHaveAttribute(
        "aria-label",
        "noDataSourceAriaLabel",
      );
      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("異常系: status=error, code=REAUTH_REQUIRED", () => {
    it("再認可メッセージとデータソース設定へのリンクを role=alert で表示する", () => {
      renderArea({ status: "error", code: "REAUTH_REQUIRED" });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-label", "reauthRequiredAriaLabel");
      expect(screen.getByText("reauthRequiredMessage")).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("href", "/datasources");
    });

    it("ChartWidget と汎用エラーメッセージは表示しない", () => {
      renderArea({ status: "error", code: "REAUTH_REQUIRED" });

      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
      expect(screen.queryByText("fetchErrorMessage")).not.toBeInTheDocument();
    });
  });

  describe("異常系: REAUTH_REQUIRED 以外の取得失敗", () => {
    it.each([
      ["FORBIDDEN"],
      ["NETWORK_ERROR"],
      ["NOT_FOUND"],
      ["UNKNOWN_XYZ"], // 境界値: 未知のコード
      [""], // 境界値: 空文字
    ])("code=%j は汎用エラーを表示し、再認可の導線は出さない", (code) => {
      renderArea({ status: "error", code });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-label", "fetchErrorAriaLabel");
      expect(screen.getByText("fetchErrorMessage")).toBeInTheDocument();
      expect(
        screen.queryByText("reauthRequiredMessage"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chart-widget")).not.toBeInTheDocument();
    });
  });
});

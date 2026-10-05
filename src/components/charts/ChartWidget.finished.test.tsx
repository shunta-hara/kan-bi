/**
 * ChartWidget の描画完了通知（onFinished）のテスト（FEAT-BF-002）。
 *
 * 背景: 印刷モード（animation: false）では ECharts の描画と `finished` が `setOption` の内部で
 * 同期的に完了し、`echarts-for-react` がその後に購読するイベントを取り逃がす。
 * その結果 `window.__chartsReady` が立たず、グラフを含むダッシュボードの PDF 出力が
 * タイムアウトしていた。購読後に呼ばれる `onChartReady` でも通知すること、
 * 通知は 1 チャートにつき 1 回に限ることを検証する。
 */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChartWidget } from "@/components/charts/ChartWidget";
import type { WidgetConfig } from "@/lib/dashboards/schema";
import type { QueryResult } from "@/lib/query/applyQuery";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ja",
}));

type CapturedProps = {
  onChartReady?: () => void;
  onEvents?: { finished?: () => void };
  option?: { animation?: boolean };
};

/** モックした ReactECharts が最後に受け取った props */
let captured: CapturedProps = {};

vi.mock("echarts-for-react", () => ({
  default: (props: CapturedProps) => {
    captured = props;
    return <div data-testid="echarts" />;
  },
}));

const CONFIG: WidgetConfig = {
  chartType: "bar",
  showLegend: true,
  showLabels: false,
  schemaVersion: 1,
};

const RESULT: QueryResult = {
  groupByColumn: "category",
  categories: ["A", "B"],
  rows: [
    { key: "A", values: { count: 10 } },
    { key: "B", values: { count: 20 } },
  ],
  measureNames: ["count"],
};

function renderChart(props: { printMode?: boolean; onFinished?: () => void }) {
  return render(
    <ChartWidget
      title="売上"
      config={CONFIG}
      result={RESULT}
      height={220}
      {...props}
    />,
  );
}

describe("ChartWidget の描画完了通知", () => {
  beforeEach(() => {
    captured = {};
  });

  describe("printMode + onFinished", () => {
    it("アニメーションを無効化し、onChartReady で完了を通知する（finished を取り逃がしても通知される）", () => {
      const onFinished = vi.fn();
      renderChart({ printMode: true, onFinished });

      expect(captured.option?.animation).toBe(false);
      expect(onFinished).not.toHaveBeenCalled();

      captured.onChartReady?.();
      expect(onFinished).toHaveBeenCalledTimes(1);
    });

    it("onChartReady と finished の両方が発火しても通知は 1 回だけ", () => {
      const onFinished = vi.fn();
      renderChart({ printMode: true, onFinished });

      captured.onChartReady?.();
      captured.onEvents?.finished?.();
      captured.onEvents?.finished?.();

      expect(onFinished).toHaveBeenCalledTimes(1);
    });
  });

  describe("printMode ではない（アニメーションあり）+ onFinished", () => {
    it("onChartReady では通知せず、finished イベントで 1 回だけ通知する", () => {
      const onFinished = vi.fn();
      renderChart({ onFinished });

      // アニメーション有効時は描画が非同期なので、初期化時点では完了とみなさない
      expect(captured.onChartReady).toBeUndefined();
      expect(captured.option?.animation).not.toBe(false);

      captured.onEvents?.finished?.();
      captured.onEvents?.finished?.();
      expect(onFinished).toHaveBeenCalledTimes(1);
    });
  });

  describe("onFinished なし", () => {
    it("イベントも onChartReady も購読しない", () => {
      renderChart({ printMode: true });

      expect(captured.onEvents).toBeUndefined();
      expect(captured.onChartReady).toBeUndefined();
    });
  });

  describe("チャートが複数ある場合（呼び出し側のカウント）", () => {
    it("各チャートの通知は独立して 1 回ずつ数えられる", () => {
      const onFinishedA = vi.fn();
      const onFinishedB = vi.fn();

      renderChart({ printMode: true, onFinished: onFinishedA });
      const readyA = captured.onChartReady;
      renderChart({ printMode: true, onFinished: onFinishedB });
      const readyB = captured.onChartReady;

      readyA?.();
      readyA?.(); // 同じチャートの重複通知は数えない
      expect(onFinishedA).toHaveBeenCalledTimes(1);
      expect(onFinishedB).not.toHaveBeenCalled();

      readyB?.();
      expect(onFinishedB).toHaveBeenCalledTimes(1);
    });
  });
});

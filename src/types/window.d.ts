/**
 * ブラウザ側グローバル変数の型拡張（FEAT-BF-002）。
 *
 * 印刷ページで全 ECharts インスタンスの描画完了を Playwright に伝えるための
 * `window.__chartsReady` フラグを宣言する。
 */
export {};

declare global {
  interface Window {
    /**
     * 印刷ページ（`/dashboards/:id/print`）で全 ECharts インスタンスが
     * `finished` イベントを発火した後に `true` がセットされる。
     * Playwright は `waitForFunction("window.__chartsReady === true")` でこのフラグを待機する。
     */
    __chartsReady?: boolean;
  }
}

/**
 * PdfDownloadButton コンポーネントのテスト（FEAT-BF-008）。
 *
 * テスト対象:
 * - widgetCount=0 のとき警告が表示される
 * - HTTP 401/404/500 それぞれで異なるエラーメッセージが表示される
 * - ネットワークエラー（fetch reject）で汎用エラーメッセージが表示される
 * - 成功時にダイアログが閉じる
 * - ダウンロード中は二重送信できない（ボタンが disabled）
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfDownloadButton } from "@/components/dashboard/PdfDownloadButton";

const MOCK_LABELS = {
  button: "Export PDF",
  downloading: "Generating…",
  paperSizeLabel: "Paper size",
  orientationLabel: "Orientation",
  paperSizeA4: "A4",
  paperSizeA3: "A3",
  orientationPortrait: "Portrait",
  orientationLandscape: "Landscape",
  downloadButton: "Download",
  cancelButton: "Cancel",
  errorMessage: "Failed to generate PDF. Please retry or try again later.",
  error401: "Your session has expired. Please sign in again.",
  error404: "Dashboard not found.",
  noWidgetsWarning:
    "No widgets found. Please add widgets before exporting PDF.",
};

/** ボタンをクリックしてポップオーバーを開く */
function renderAndOpen(widgetCount = 1) {
  render(
    <PdfDownloadButton
      dashboardId="dash-1"
      widgetCount={widgetCount}
      labels={MOCK_LABELS}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: MOCK_LABELS.button }));
}

/** fetch の成功レスポンスを返すモック */
function mockFetchSuccess() {
  const blob = new Blob(["pdf"], { type: "application/pdf" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'filename="dashboard.pdf"' },
      blob: async () => blob,
    })),
  );
}

/** fetch の失敗レスポンス（指定 HTTP ステータス）を返すモック */
function mockFetchError(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      headers: { get: () => null },
    })),
  );
}

describe("PdfDownloadButton", () => {
  beforeEach(() => {
    // jsdom は URL.createObjectURL / revokeObjectURL を実装していないためスタブする
    URL.createObjectURL = vi.fn(() => "blob:fake-url");
    URL.revokeObjectURL = vi.fn();
    // anchor.click() が実際にナビゲーションを試みないようにスパイ
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ──────────────────────────────────────────
  // ウィジェット数の警告
  // ──────────────────────────────────────────

  describe("widgetCount=0 の警告表示", () => {
    it("widgetCount=0 のとき警告メッセージを表示する", () => {
      renderAndOpen(0);
      expect(screen.getByRole("alert")).toHaveTextContent(
        MOCK_LABELS.noWidgetsWarning,
      );
    });

    it("widgetCount>0 のとき警告メッセージを表示しない（境界値: 1件）", () => {
      renderAndOpen(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────
  // HTTP ステータスによるエラーメッセージ出し分け
  // ──────────────────────────────────────────

  describe("HTTP エラー時のメッセージ出し分け", () => {
    it.each([
      [401, MOCK_LABELS.error401],
      [404, MOCK_LABELS.error404],
      [500, MOCK_LABELS.errorMessage],
    ] as const)(
      "HTTP %i のとき適切なエラーメッセージを表示する",
      async (status, expectedMessage) => {
        mockFetchError(status);
        renderAndOpen();
        fireEvent.click(
          screen.getByRole("button", { name: MOCK_LABELS.downloadButton }),
        );

        await waitFor(() => {
          expect(screen.getByRole("alert")).toHaveTextContent(expectedMessage);
        });
      },
    );

    it("fetch が reject したとき汎用エラーメッセージを表示する（ネットワークエラー）", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network error");
        }),
      );
      renderAndOpen();
      fireEvent.click(
        screen.getByRole("button", { name: MOCK_LABELS.downloadButton }),
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          MOCK_LABELS.errorMessage,
        );
      });
    });
  });

  // ──────────────────────────────────────────
  // 成功時の挙動
  // ──────────────────────────────────────────

  describe("ダウンロード成功時の挙動", () => {
    it("ダウンロード成功時にダイアログが閉じる", async () => {
      mockFetchSuccess();
      renderAndOpen();
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: MOCK_LABELS.downloadButton }),
      );

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("失敗後に再試行するとエラー表示がクリアされ、成功すればダイアログが閉じる", async () => {
      mockFetchError(500);
      renderAndOpen();
      fireEvent.click(
        screen.getByRole("button", { name: MOCK_LABELS.downloadButton }),
      );
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          MOCK_LABELS.errorMessage,
        );
      });

      mockFetchSuccess();
      fireEvent.click(
        screen.getByRole("button", { name: MOCK_LABELS.downloadButton }),
      );

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────
  // 二重送信防止
  // ──────────────────────────────────────────

  describe("ダウンロード中の二重送信防止", () => {
    it("ダウンロード中はボタンが disabled になり二重送信できない", async () => {
      // fetch を保留状態にする
      let resolveFetch!: (value: unknown) => void;
      const pendingFetch = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      const fetchMock = vi.fn(() => pendingFetch);
      vi.stubGlobal("fetch", fetchMock);

      renderAndOpen();
      fireEvent.click(
        screen.getByRole("button", { name: MOCK_LABELS.downloadButton }),
      );

      // ダウンロード中のテキストが表示されボタンが disabled になる
      await waitFor(() => {
        expect(screen.getByText(MOCK_LABELS.downloading)).toBeInTheDocument();
      });
      const generatingBtn = screen
        .getByText(MOCK_LABELS.downloading)
        .closest("button");
      expect(generatingBtn).toBeDisabled();

      // 保留中に再クリックしても fetch は追加で呼ばれない
      fireEvent.click(generatingBtn!);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // テスト終了前に fetch を解決してクリーンアップ
      resolveFetch({ ok: false, status: 500, headers: { get: () => null } });
      await waitFor(() => {
        expect(
          screen.queryByText(MOCK_LABELS.downloading),
        ).not.toBeInTheDocument();
      });
    });
  });
});

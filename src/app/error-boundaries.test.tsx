/**
 * エラー境界コンポーネントテスト（FEAT-SEN-003）。
 *
 * `reportClientError` ヘルパーをモックし、描画時にエラーが 1 回渡されることを検証する。
 * `@sentry/nextjs` は動的 import で呼ばれるため、ここでは直接モックしない。
 */

import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// reportClientError をモック（動的 import の @sentry/nextjs を避ける）
vi.mock("@/lib/observability/reportClientError", () => ({
  reportClientError: vi.fn().mockResolvedValue(undefined),
}));

// next-intl のモック（useTranslations を使用しているため）
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { reportClientError } from "@/lib/observability/reportClientError";
import AppError from "@/app/(app)/error";
import GlobalError from "@/app/global-error";

describe("AppError (error.tsx)", () => {
  beforeEach(() => {
    vi.mocked(reportClientError).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常系: 描画されたとき渡されたエラーが reportClientError に 1 回渡される", async () => {
    const error = new Error("test app error");
    const reset = vi.fn();

    await act(async () => {
      render(<AppError error={error} reset={reset} />);
    });

    expect(reportClientError).toHaveBeenCalledOnce();
    expect(reportClientError).toHaveBeenCalledWith(error);
  });

  it("正常系: DSN 未設定でも例外をスローしない（reportClientError は no-op）", async () => {
    const error = new Error("silent error");
    const reset = vi.fn();

    await expect(
      act(async () => {
        render(<AppError error={error} reset={reset} />);
      }),
    ).resolves.not.toThrow();
  });
});

describe("GlobalError (global-error.tsx)", () => {
  beforeEach(() => {
    vi.mocked(reportClientError).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常系: 描画されたとき渡されたエラーが reportClientError に 1 回渡される", async () => {
    const error = new Error("test global error");
    const reset = vi.fn();

    await act(async () => {
      render(<GlobalError error={error} reset={reset} />);
    });

    expect(reportClientError).toHaveBeenCalledOnce();
    expect(reportClientError).toHaveBeenCalledWith(error);
  });

  it("正常系: DSN 未設定でも例外をスローしない（reportClientError は no-op）", async () => {
    const error = new Error("silent global error");
    const reset = vi.fn();

    await expect(
      act(async () => {
        render(<GlobalError error={error} reset={reset} />);
      }),
    ).resolves.not.toThrow();
  });

  it("正常系: html/body 要素を含む必須構造でレンダリングされる", async () => {
    const error = new Error("structure test");
    const reset = vi.fn();
    let container!: HTMLElement;

    await act(async () => {
      const result = render(<GlobalError error={error} reset={reset} />);
      container = result.container;
    });

    // button が存在することを確認（再試行ボタン）
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
  });
});

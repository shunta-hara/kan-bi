/**
 * FEAT-E2E-001: テスト環境基盤のスモークテスト
 *
 * 基盤コンポーネント（セッション注入・フェッチスタブ・DB 前後処理）が
 * 正しく機能していることを確認する。
 */

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  createTestDataSource,
  cleanupUsers,
  prismaE2e,
} from "./support/db";
import { injectSessionCookie } from "./support/session";

test.describe("E2E foundation smoke tests — FEAT-E2E-001", () => {
  // ─── セッション注入: /dashboards がリダイレクトされない ───

  test("injected session cookie prevents /dashboards redirect", async ({
    page,
    context,
  }) => {
    const user = await createTestUser("foundation-session");
    const userIds = [user.id];

    try {
      await injectSessionCookie(context, user);
      await page.goto("/dashboards", { waitUntil: "domcontentloaded" });

      // /login にリダイレクトされないこと
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await cleanupUsers(userIds);
    }
  });

  // ─── フェッチスタブ: データソースプレビュー API が固定 CSV を返す ───
  //
  // 検証方式:
  // - サーバー側 fetch はブラウザのネットワークイベントに現れないため
  //   page.on("request") で検知することは不可能（常に 0 になる死んだアサートになる）。
  // - 代わりに「スタブなしなら空になり、スタブありなら 3 行以上返る」という
  //   API レスポンスの行数で間接検証する。
  // - 実測による検証（スタブ無効時の挙動）:
  //   NODE_OPTIONS から --import fetch-stub.mjs を除いてサーバーを起動し、
  //   同じ API を呼んだところ rows.length = 0 を返した（Google は 403 FORBIDDEN を返すため
  //   FORBIDDEN エラーに分類され、例外キャッチにより空プレビューとして返される）。
  //   スタブ有効時は rows.length = 3 となることでスタブが機能していることを確認。

  test("fetch stub returns fixed CSV data via preview API", async ({
    context,
  }) => {
    const user = await createTestUser("foundation-stub");
    const ds = await createTestDataSource(user.id, "Stub DataSource");
    const userIds = [user.id];

    try {
      await injectSessionCookie(context, user);

      // データソース詳細 API を呼ぶ（内部でサーバー側 fetch → スタブが固定 CSV を返す）
      const response = await context.request.get(`/api/datasources/${ds.id}`);

      // スタブが正常に応答していれば 200 が返る（固定 CSV をパースできる）
      expect(response.status()).toBe(200);

      const body = (await response.json()) as {
        data: { id: string; preview: { columns: unknown[]; rows: unknown[] } };
      };

      // スタブが固定 CSV（3 行）を返しているため列・行が存在する。
      // スタブなし時は Google が 403 → 空プレビューで rows.length = 0 になる。
      expect(body.data.preview.columns.length).toBeGreaterThan(0);
      expect(body.data.preview.rows.length).toBeGreaterThanOrEqual(3);
    } finally {
      await cleanupUsers(userIds);
    }
  });

  // ─── DB 前後処理: テストデータが投入・削除される ───

  test("database seed and cleanup work correctly", async () => {
    const user = await createTestUser("foundation-db");

    // ユーザーが実際に DB に作成されていること
    expect(user.id).toBeTruthy();
    expect(user.email).toMatch(/e2e-foundation-db-/);

    // 後始末
    await cleanupUsers([user.id]);

    // 削除後は DB からユーザーを取得できないことを確認
    const deleted = await prismaE2e.user.findUnique({
      where: { id: user.id },
    });
    expect(deleted).toBeNull();
  });

  // ─── 異常系: AUTH_SECRET 未設定時は createSessionCookieValue がエラーを投げる ───

  test("createSessionCookieValue throws when AUTH_SECRET is missing", async () => {
    const { createSessionCookieValue } = await import("./support/session");
    const savedSecret = process.env.AUTH_SECRET;

    try {
      delete process.env.AUTH_SECRET;
      await expect(createSessionCookieValue({ id: "test-id" })).rejects.toThrow(
        "AUTH_SECRET",
      );
    } finally {
      // undefined の場合は delete、設定済みの場合は復元する（文字列 "undefined" にしない）
      if (savedSecret !== undefined) {
        process.env.AUTH_SECRET = savedSecret;
      } else {
        delete process.env.AUTH_SECRET;
      }
    }
  });
});

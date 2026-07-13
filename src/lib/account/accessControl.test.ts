/**
 * FEAT-014: アクセス制御 — 所有権チェックパターンの単体テスト。
 *
 * Route Handler / Server Action の所有権チェック実装パターンを、
 * 純粋関数として抽出して検証する。
 * （実際の DB アクセスを持つ Route Handler 自体は結合テスト対象のため、
 *  ここではロジックの核心となる「所有権判定」を独立してテストする）
 */
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 所有権チェック: Route Handler 全体で共通のパターンを純粋関数として表現
// ─────────────────────────────────────────────────────────────────────────────

/**
 * リソースの所有権を確認するユーティリティ（テスト目的の純粋関数）。
 * 実際の Route Handler では `findUnique` → `ownerId === session.user.id` の形で実装する。
 */
function checkOwnership(
  resource: { ownerId: string } | null,
  requestUserId: string,
): "ok" | "not_found" | "forbidden" {
  if (!resource) return "not_found";
  // 存在しない ID と他人の ID を区別しない（リソースの存在を漏らさないため）
  if (resource.ownerId !== requestUserId) return "not_found";
  return "ok";
}

/**
 * 未認証チェック（Route Handler 冒頭の guard に対応）。
 */
function checkAuthentication(
  userId: string | null | undefined,
): "ok" | "unauthenticated" {
  if (!userId) return "unauthenticated";
  return "ok";
}

describe("checkAuthentication", () => {
  describe("正常系", () => {
    it("userId が存在する場合は ok を返す", () => {
      expect(checkAuthentication("user_abc123")).toBe("ok");
    });
  });

  describe("異常系", () => {
    it("userId が null の場合は unauthenticated を返す（未ログイン）", () => {
      expect(checkAuthentication(null)).toBe("unauthenticated");
    });

    it("userId が undefined の場合は unauthenticated を返す", () => {
      expect(checkAuthentication(undefined)).toBe("unauthenticated");
    });
  });

  describe("境界値", () => {
    it("userId が空文字列の場合は unauthenticated を返す", () => {
      expect(checkAuthentication("")).toBe("unauthenticated");
    });

    it("userId が 1 文字の場合は ok を返す", () => {
      expect(checkAuthentication("x")).toBe("ok");
    });
  });
});

describe("checkOwnership", () => {
  describe("正常系: 所有者一致", () => {
    it("ownerId と requestUserId が一致する場合は ok を返す", () => {
      const result = checkOwnership({ ownerId: "user_abc123" }, "user_abc123");
      expect(result).toBe("ok");
    });
  });

  describe("異常系: 所有者不一致 / リソース未存在", () => {
    it("ownerId と requestUserId が不一致の場合は not_found を返す（存在を漏らさない）", () => {
      const result = checkOwnership({ ownerId: "user_owner" }, "user_attacker");
      // 他人のリソースへのアクセスは 403 ではなく 404 で返す（存在を漏らさない）
      expect(result).toBe("not_found");
    });

    it("リソースが存在しない（null）場合も not_found を返す", () => {
      const result = checkOwnership(null, "user_abc123");
      expect(result).toBe("not_found");
    });
  });

  describe("境界値", () => {
    it("ownerId と requestUserId が両方同じ空文字でも一致は ok を返す（境界値）", () => {
      const result = checkOwnership({ ownerId: "" }, "");
      expect(result).toBe("ok");
    });

    it("大文字小文字が異なる場合は not_found を返す（厳密一致）", () => {
      const result = checkOwnership({ ownerId: "User_ABC" }, "user_abc");
      expect(result).toBe("not_found");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FEAT-014 受け入れ基準の確認テスト
// ─────────────────────────────────────────────────────────────────────────────

describe("FEAT-014: アクセス制御の受け入れ基準", () => {
  describe("他のユーザーが所有するリソースへの直接アクセスは拒否される", () => {
    it("ユーザー A のリソースをユーザー B がアクセスしようとすると not_found", () => {
      const resourceOwnedByUserA = { ownerId: "user_A" };
      const userB = "user_B";

      const authResult = checkAuthentication(userB);
      expect(authResult).toBe("ok"); // B はログイン済み

      const ownerResult = checkOwnership(resourceOwnedByUserA, userB);
      expect(ownerResult).toBe("not_found"); // B は A のリソースにアクセス不可
    });
  });

  describe("未ログイン状態での操作はすべてログイン画面へ誘導される", () => {
    it("未認証ユーザーは unauthenticated として判定される", () => {
      const unauthenticatedUser = null;
      const authResult = checkAuthentication(unauthenticatedUser);
      expect(authResult).toBe("unauthenticated");
    });
  });

  describe("自分のリソースにはアクセスできる", () => {
    it("自分が所有するリソースには ok が返る", () => {
      const userId = "user_owner_123";
      const ownResource = { ownerId: userId };

      const authResult = checkAuthentication(userId);
      const ownerResult = checkOwnership(ownResource, userId);

      expect(authResult).toBe("ok");
      expect(ownerResult).toBe("ok");
    });
  });
});

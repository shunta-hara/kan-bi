// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  pdfToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { consumePdfToken, issuePdfToken } from "./pdfToken";

const USER_ID = "user-1";
const DASHBOARD_ID = "dash-1";

async function issue(): Promise<{ token: string; jti: string }> {
  prismaMock.pdfToken.create.mockResolvedValue({});
  prismaMock.pdfToken.deleteMany.mockResolvedValue({ count: 0 });
  const { token } = await issuePdfToken(USER_ID, DASHBOARD_ID);
  const jti = prismaMock.pdfToken.create.mock.calls.at(-1)?.[0].data.jti;
  return { token, jti };
}

function storedRecord(jti: string, overrides: Record<string, unknown> = {}) {
  return {
    jti,
    userId: USER_ID,
    dashboardId: DASHBOARD_ID,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe("consumePdfToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "test-secret-for-pdf-token-tests";
    delete process.env.PDF_SECRET;
  });

  it("未使用のトークンを検証し、アトミックに使用済みにする", async () => {
    const { token, jti } = await issue();
    prismaMock.pdfToken.findUnique.mockResolvedValue(storedRecord(jti));
    prismaMock.pdfToken.updateMany.mockResolvedValue({ count: 1 });

    const payload = await consumePdfToken(token);

    expect(payload.sub).toBe(USER_ID);
    expect(payload.dashboardId).toBe(DASHBOARD_ID);
    expect(prismaMock.pdfToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jti,
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  it("並行リクエストに先に消費された場合（updateMany が 0 件）は拒否する", async () => {
    const { token, jti } = await issue();
    prismaMock.pdfToken.findUnique.mockResolvedValue(storedRecord(jti));
    prismaMock.pdfToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(consumePdfToken(token)).rejects.toThrow(
      "PDF token already used or expired",
    );
  });

  it("使用済みトークンは拒否し、更新も行わない", async () => {
    const { token, jti } = await issue();
    prismaMock.pdfToken.findUnique.mockResolvedValue(
      storedRecord(jti, { usedAt: new Date() }),
    );

    await expect(consumePdfToken(token)).rejects.toThrow(
      "PDF token already used",
    );
    expect(prismaMock.pdfToken.updateMany).not.toHaveBeenCalled();
  });

  it("DB 上で期限切れのトークンは拒否する", async () => {
    const { token, jti } = await issue();
    prismaMock.pdfToken.findUnique.mockResolvedValue(
      storedRecord(jti, { expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(consumePdfToken(token)).rejects.toThrow("PDF token expired");
    expect(prismaMock.pdfToken.updateMany).not.toHaveBeenCalled();
  });

  it("userId / dashboardId の束縛が一致しない場合は拒否する", async () => {
    const { token, jti } = await issue();
    prismaMock.pdfToken.findUnique.mockResolvedValue(
      storedRecord(jti, { dashboardId: "other-dashboard" }),
    );

    await expect(consumePdfToken(token)).rejects.toThrow(
      "PDF token binding mismatch",
    );
    expect(prismaMock.pdfToken.updateMany).not.toHaveBeenCalled();
  });

  it("DB にレコードが無い場合は拒否する", async () => {
    const { token } = await issue();
    prismaMock.pdfToken.findUnique.mockResolvedValue(null);

    await expect(consumePdfToken(token)).rejects.toThrow("PDF token not found");
  });

  it("署名が不正なトークンは拒否する", async () => {
    await expect(consumePdfToken("not-a-jwt")).rejects.toThrow();
    expect(prismaMock.pdfToken.findUnique).not.toHaveBeenCalled();
  });
});

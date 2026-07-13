import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Next.js の開発時ホットリロードで PrismaClient が複数生成されるのを防ぐため、
// グローバルにキャッシュしたインスタンスを再利用する。
// 参考: https://www.prisma.io/docs/guides/nextjs
//
// Prisma 7 では PrismaClient の生成にドライバアダプタが必須になったため、
// `@prisma/adapter-pg`（node-postgres ベース）を `DATABASE_URL` から構成する。
// 参考: https://pris.ly/d/client-constructor

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in your environment (.env.local) before using the database.",
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

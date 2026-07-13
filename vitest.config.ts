import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest 設定。
 * - `lib/` の単体・結合テストと、コンポーネントの軽量レンダリングテストの両方を
 *   同じ設定でカバーする（仕様書 §13 / .claude/rules/testing.md 準拠）。
 * - `@/` エイリアスは Vite ネイティブの tsconfig paths 解決を利用する。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});

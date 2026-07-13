---
name: feedback-server-only-testability
description: server-only modules cannot be imported in vitest tests — extract pure logic/schemas into separate dependency-free modules
metadata:
  type: feedback
---

In `web_bi`, modules that `import "server-only"` (e.g. `src/lib/auth/auth.ts`,
`src/lib/audit/auditLog.ts`) throw immediately when imported in Vitest/jsdom,
because the `server-only` package's `index.js` unconditionally throws
"This module cannot be imported from a Client Component module." outside of
Next.js's bundler-aliased server context. Importing `prisma.ts` also throws if
`DATABASE_URL` isn't populated into `process.env` (Vitest does not load
`.env.local` by default).

**Why:** Discovered while adding Sprint 1 unit tests for `isProtectedPath`
(in `middleware.ts`, which imports `auth.ts` → `server-only` + `prisma`) and
for `recordAuditEventInputSchema`/`auditMetadataSchema` (originally defined
inline in `auditLog.ts`, which also imports `server-only` + `prisma`).
Both were untestable as written.

**How to apply:** When a new sprint needs to test logic that lives in a
`server-only` module (Zod schemas, pure helper functions, path/string
predicates), extract that pure logic into a sibling module with NO
`server-only` / `prisma` / `next-auth` imports — e.g.
`src/lib/audit/schema.ts` (schemas only) and `src/lib/auth/protectedPaths.ts`
(pure `isProtectedPath` predicate, re-used by `middleware.ts`). The
`server-only` module then imports and re-exports from the pure module for
backward compatibility. This aligns with [[architecture-schema-ts-convention]]
("ドメイン共通の型・Zod スキーマは `schema.ts` に集約する") and keeps tests
fast and dependency-free. Do NOT try to mock `server-only` or set
`DATABASE_URL` in vitest config as a workaround — extraction is cleaner and
matches the existing layering rules.

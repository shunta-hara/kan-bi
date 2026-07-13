---
name: feedback-nextjs-middleware-edge-runtime
description: Always boot the dev server and curl every route (including public ones) — Next.js middleware Edge Runtime + Prisma/pg crypto incompatibility caused a full app outage that static checks (tsc, vitest) completely missed
metadata:
  type: feedback
---

When evaluating a Next.js project that uses `src/middleware.ts` together with Auth.js v5 +
Prisma Adapter (or any DB driver like `pg`/`@prisma/adapter-pg`), do not trust that
`tsc --noEmit` and `vitest run` passing means the app runs. In Sprint 1 of web-bi, both
passed 100% (0 TS errors, 33/33 tests), yet `pnpm dev` + curl showed **every single route
including the public `/` returned HTTP 500** with "The edge runtime does not support
Node.js 'crypto' module" — because `middleware.ts` imported the full `auth.ts` (which
pulls in `PrismaAdapter` → `@/lib/db/prisma` → `@prisma/adapter-pg` → `pg` → Node `crypto`),
and Next.js middleware compiles for the Edge Runtime by default.

**Why:** Static type-checking and unit tests never load `middleware.ts` through Next's
build pipeline, so this class of bug (Node-only module reachable from Edge Runtime code)
is invisible without actually starting the dev server and hitting routes over HTTP. This
is apparently a well-known Auth.js v5 + Prisma Adapter pitfall — the official fix is the
"split config" pattern: a lightweight `auth.config.ts` (no Adapter, no DB imports) used
only in `middleware.ts`, with the full DB-backed config (`auth.ts`) reserved for
Node.js-runtime contexts (Route Handlers, Server Components). Reference:
https://authjs.dev/guides/edge-compatibility

**How to apply:** For ANY sprint touching `middleware.ts` (auth guards, redirects, etc),
always run `pnpm dev` and curl a representative set of routes — including at least one
PUBLIC, non-protected route like `/` — not just the protected ones. A failure that looks
like "redirect didn't happen" might actually be "the entire server returns 500 and the
redirect logic never even runs." Check the dev server log for "edge runtime does not
support Node.js" errors specifically when middleware imports anything auth/DB-related.
This check should be a standing part of [[project-web-bi-overview]] sprint evaluations
whenever middleware changes are involved (Sprint 1, and likely Sprint 9 FEAT-014 access
control work).

**Validated fix (2026-06-08 re-eval, Sprint 1 pass 2):** The official Auth.js v5 "split
config" pattern fully resolves this when implemented as a clean 3-way split:
`auth.config.ts` (providers/pages/`callbacks.authorized` only, zero DB imports) →
`auth.edge.ts` (`NextAuth(authConfig)` only, exports `authEdge` for middleware) →
`auth.ts` (`import "server-only"`, spreads `authConfig` + adds `PrismaAdapter`/audit
log/events, used only by Route Handlers/Server Components/Server Actions). Confirmed by:
(1) grep showing zero `prisma`/`pg`/`server-only`/`recordAuditEvent` references reachable
from `middleware.ts` → `auth.edge.ts` → `auth.config.ts`, (2) `pnpm dev` + curl showing
clean `✓ Compiled /middleware in 194ms` with no crypto/edge-runtime errors and correct
307 redirects with `callbackUrl`, and (3) `pnpm build` succeeding with Middleware bundled
at 87.4 kB. When re-evaluating a "split config" fix, grep the import graph of all three
auth files plus `middleware.ts` to confirm the split isn't "half-done" (e.g. `auth.edge.ts`
accidentally importing from `auth.ts` instead of `auth.config.ts`), then verify with
`pnpm build` in addition to `pnpm dev` — a production build will hard-fail if Node-only
modules are reachable from Edge code, giving a second independent confirmation signal.

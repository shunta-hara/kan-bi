---
name: project-web-bi-overview
description: Kan. Sheets BI (web-bi) project — Next.js 15 + Auth.js v5 + Prisma BI tool, evaluated via Planner→Generator→Evaluator sprint cycle
metadata:
  type: project
---

Project "web-bi" (Kan. Sheets BI): Next.js 15 (App Router) + TypeScript app that
visualizes Google Sheets data into draggable dashboards with PDF export. Spec at
`docs/spec-kan-sheets-bi.md` (10 sprints, FEAT-001..019). Stack: Auth.js v5 (Google OAuth +
Prisma Adapter, database sessions), Prisma + PostgreSQL (`@prisma/adapter-pg` / `pg`),
Tailwind, ECharts, react-grid-layout, next-intl, Vitest.

No local PostgreSQL is available in the dev environment (port 5432 has no listener) —
DB-dependent flows (session lookups, Prisma queries) cannot be exercised end-to-end.
Real Google OAuth credentials are also not provided (`.env.local` has dummy
`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` values), so real login E2E is impossible.

**Why:** This is a Planner→Generator→Evaluator cycle project (see project CLAUDE.md). I am
the evaluator — I run static checks then start `pnpm dev` and probe routes with curl to
verify Must-feature acceptance criteria for each sprint.

**How to apply:** For future sprint evaluations, expect to rely on build/typecheck/test +
HTTP-level route probing (curl) rather than full Playwright E2E with real auth, unless
the user provisions a local DB and OAuth credentials. Always note explicitly which
acceptance criteria could not be verified due to missing DB/OAuth, per generator's own
disclaimer pattern. See [[feedback-nextjs-middleware-edge-runtime]] for a critical pitfall
found in Sprint 1.

---
name: feedback-authjs-session-strategy-mismatch
description: When Auth.js v5 split-config (auth.config.ts/auth.edge.ts/auth.ts) is used with database sessions, always grep for session.strategy/cookies/jwt overrides — adapter presence silently flips the default strategy and breaks req.auth in middleware
metadata:
  type: feedback
---

In Sprint 2 of web-bi, the user suspected that "database session strategy + adapter-less
edge config makes middleware always return a null session, locking out logged-in users."
I confirmed this is a REAL, fatal, code-traced bug — not a false alarm — by reading
`@auth/core@0.41.2` source directly (no live login was needed; pure code-tracing was
sufficient and conclusive):

1. `@auth/core/lib/init.js:74`: `strategy: config.adapter ? "database" : "jwt"` — the
   session strategy is silently inferred from whether `adapter` is present, UNLESS
   `config.session.strategy` is explicitly set.
2. The split-config's shared `auth.config.ts` had no `session`/`cookies`/`jwt` overrides.
   `auth.ts` (Node, has `PrismaAdapter`) explicitly set `session.strategy: "database"`
   and issues an opaque `crypto.randomUUID()` token. `auth.edge.ts` (`NextAuth(authConfig)`,
   NO adapter) therefore silently resolved to `"jwt"` strategy.
3. Both configs use the same default cookie name `authjs.session-token` (no `cookies`
   override), so they fight over the same cookie.
4. `next-auth/lib/index.js: getSession` → `Auth(request, {...config, action: "session"})`
   → `@auth/core/lib/actions/session.js`: when `sessionStrategy === "jwt"`, it calls
   `jwt.decode()` on the cookie value and NEVER reaches `adapter.getSessionAndUser`.
   The opaque database-session token fails `jwt.decode`, throws `JWTSessionError`, the
   cookie gets cleared, and `response.body = null`.
5. `handleAuth` sets `req.auth = await sessionResponse.json()` → `null`. Middleware's
   `isLoggedIn = Boolean(req.auth)` is always `false` for every logged-in user.

**Why this matters for [[project-web-bi-overview]]:** Sprint 1 was evaluated as PASS
based on compile success + 307-redirect-when-logged-out checks (see
[[feedback-nextjs-middleware-edge-runtime]]). But "redirects work when logged out" is the
EASY direction to verify without real OAuth — the bug only manifests in the
"logged-in user tries to reach a protected page" direction, which silently fails because
`req.auth` is always `null`. This blocked 100% of Sprint 2 (FEAT-002, all routes under
`/datasources`) since every protected route is unreachable. I had to retroactively amend
[[Knowledge/web-bi/sprint-1-eval]] to flag that its "PASS" verdict on the login→protected-page
round trip was never actually validated (it was marked "code review only, no real login E2E"
— but the code-review depth was insufficient to catch a strategy mismatch that grep alone
would reveal).

**How to apply:** For ANY Auth.js v5 project using split-config (`auth.config.ts` shared +
separate Edge/Node `NextAuth()` instantiations) AND database sessions (has `adapter` +
`session.strategy: "database"` anywhere):
1. `grep -n "strategy\|cookies:\|jwt:\|session:" src/lib/auth/*.ts` — confirm whether the
   shared/base config sets `session.strategy` explicitly. If it's absent and one variant
   has an `adapter` and the other doesn't, the strategies WILL diverge silently
   (`config.adapter ? "database" : "jwt"` in `@auth/core/lib/init.js`).
2. This is detectable by pure code-tracing — no live login needed. Read
   `node_modules/.pnpm/@auth+core@*/node_modules/@auth/core/lib/init.js` (strategy
   inference) and `.../lib/actions/session.js` (jwt vs database branch) directly; the
   logic is simple enough that reading it settles the question definitively.
3. Add this grep to the standing middleware-evaluation checklist alongside the Edge
   Runtime crypto check from [[feedback-nextjs-middleware-edge-runtime]] — "compiles and
   redirects-when-logged-out" is NOT sufficient evidence that auth works; the
   logged-in-reaches-protected-page direction needs separate verification (via grep/code
   trace when live login is impossible).
4. Correct fixes: either unify on JWT session strategy app-wide (keep adapter only for
   OAuth account persistence), or make the Edge-side check a lightweight optimistic
   cookie-presence check (not `jwt.decode`) and defer real validation to Node-runtime
   `auth()`. See https://authjs.dev/guides/edge-compatibility for the official guidance
   on database-session + middleware limitations — the split-config page does NOT by
   itself solve database-session compatibility; it only solves the crypto/Edge-Runtime
   compile error.

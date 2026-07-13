---
name: authjs-split-config-session-strategy
description: Auth.js v5 split-config (Edge/Node) must explicitly pin session.strategy to avoid silent jwt/database mismatch
metadata:
  type: feedback
---

When using Auth.js v5's "split config" pattern (lightweight `auth.config.ts` shared
between an Edge `auth.edge.ts` for `middleware.ts` and a full `auth.ts` with
`PrismaAdapter` for Node runtime), you MUST explicitly set `session: { strategy: "jwt" }`
in the **shared** config object — never leave it unset.

**Why:** `@auth/core`'s `init.js` infers the strategy as
`config.adapter ? "database" : "jwt"`. If the shared config omits `session`, the
Node-side config (with `PrismaAdapter`) silently becomes `"database"` (issuing opaque
`crypto.randomUUID()` tokens), while the Edge-side config (no adapter, used by
middleware) silently becomes `"jwt"` (expects to `jwt.decode()` the cookie). Both write
to/read the same `authjs.session-token` cookie, so the Edge side's `jwt.decode()` always
fails on the Node side's opaque token → `JWTSessionError` → cookie cleared →
`req.auth` is permanently `null` in middleware → logged-in users get infinite-redirected
away from every protected page. This is a completely silent failure: TypeScript compiles
clean, all unit tests pass, and `pnpm build` succeeds — it only manifests when you
actually load a protected page with a real session cookie.

**How to apply:**
- Always pin `session.strategy` explicitly in the shared/lightweight config object that
  both Edge and Node configs spread (`...authConfig`), so neither side can infer a
  different strategy based on adapter presence.
- Prefer `"jwt"` for setups where `middleware.ts` needs to check session presence —
  it lets Edge Runtime verify the cookie without DB access. Keep `PrismaAdapter` for
  OAuth account/refresh-token persistence only; it does not need to dictate session
  strategy.
- With `"jwt"` strategy, the `session` callback receives `{ session, token }` — NOT
  `{ session, user }` (that shape is database-strategy only). Add a `jwt` callback to
  persist `user.id` into `token.sub` at sign-in, then read `token.sub` in the `session`
  callback to populate `session.user.id`.
- **Verification that actually catches this class of bug**: tsc/vitest/build are
  insufficient — you must generate a real signed session cookie (e.g. via
  `encode()` from `next-auth/jwt`, reading `AUTH_SECRET` from `.env.local`, run inside
  a vitest test with `// @vitest-environment node` pragma — jsdom's `Uint8Array` realm
  differs from Node's and breaks `jose`'s `instanceof` checks) and curl the running dev
  server with `Cookie: authjs.session-token=<token>` to confirm protected pages return
  200 (not a redirect loop). Also test: no cookie → redirect to `/login`, tampered
  cookie → graceful redirect (not a crash), logged-in visiting `/login` → redirect to
  `/dashboards`.

See [[feedback_server_only_testability]] for the related pattern of extracting
edge-compatible logic out of `server-only` modules.

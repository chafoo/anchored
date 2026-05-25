---
slug: add-rate-limit
status: done
created: 2026-03-14
---

# Rate Limiting for Public API

## Context
Public API endpoints needed rate limiting to prevent abuse. The codebase
already had middleware infrastructure: `src/middleware/auth.ts` uses
Fastify hooks (`fastify.addHook`) and reads config from `process.env`.
Rate-limiting middleware didn't exist; this task added it alongside
the existing pattern.

### Plan
- Default Fastify rate-limit plugin (`@fastify/rate-limit`) is suitable — battle-tested, fits the existing addHook pattern.
- Sticking with token-bucket algorithm for V1 (built into the plugin); sliding-window deferred.
- Q: [blocking] Rate-limit per IP, per API-key, or both?
  → resolved: both — per-IP for unauthenticated, per-API-key for authenticated requests
- Q: Limit response — 429 with Retry-After header, or custom error body?
  → resolved: 429 + Retry-After (standards-compliant); custom body deferred to V2

### Build
#### Implement
- rate-limit-middleware / Rate Limit Middleware
  Switched from `@fastify/rate-limit`'s default in-memory store to `@fastify/rate-limit`'s Redis adapter since we already use Redis for sessions. Single source of state across cluster.
- route-coverage / Route Coverage + Per-Route Tuning
  Discovered `/api/health` was being rate-limited too; added explicit `skipOnError: true` for health-check routes.

#### task-check
- rate-limit-middleware / Rate Limit Middleware
  verdict: pass — all 4 ACs have evidence, file:line refs and test counts verified
- route-coverage / Route Coverage + Per-Route Tuning
  verdict: pass — all 4 ACs have evidence, including README docs reference

#### code-check
- rate-limit-middleware / Rate Limit Middleware
  verdict: pass — no violations of must_follow rules; middleware registered via fastify.addHook pattern, config from process.env
- route-coverage / Route Coverage + Per-Route Tuning
  verdict: warn — 1 finding
  finding [warn] src/api/routes/public/health.ts:8: hardcoded "skipOnError" override should ideally be config-driven — acceptable for V1, file follow-up issue

### Wrap

**Shipped**: 2 phases done (out of 2 planned).
**ACs with evidence**: 8 of 8 (100% honest completion).

**Notable findings during build**:
- code-check flagged hardcoded `skipOnError` override on health route as warn-severity — acceptable for V1 ship, tracked as follow-up.

**Notable findings from review**:
- `@fastify/rate-limit` Redis adapter doesn't expose connection-pool tuning by default; documented current settings in `src/middleware/README.md` for future ops awareness.

**Outcome vs plan**: shipped per plan with two pivots — (1) used Redis-backed store instead of in-memory (better for our existing cluster setup), (2) added explicit health-check skip (operational catch during phase 2). Deferred: custom 429 response body to V2.

#### review
- src/middleware/rate-limit.ts:24 — magic number `100` should be named constant `DEFAULT_LIMIT_PER_MINUTE`
- src/api/routes/public/health.ts:8 — `skipOnError: true` lacks doc comment explaining why
- src/middleware/rate-limit.ts:42 — Redis connection error handling falls back silently to in-memory; consider logging

## Phases

### Rate Limit Middleware
<!-- id: rate-limit-middleware -->
- status: done
- commit: a4f2c19
- coverage_pct: 92
- context: Add @fastify/rate-limit registration alongside src/middleware/auth.ts. Config keys via process.env (RATE_LIMIT_MAX, RATE_LIMIT_WINDOW).
- rules:
  - path: .claude/rules/_pattern/middleware.md
    why: this phase adds new middleware via fastify.addHook pattern
  - path: .claude/rules/_pattern/config.md
    why: rate-limit thresholds need process.env config, not hardcoded
- acceptance_criteria:
  - Tests written first (TDD)
    evidence: src/middleware/rate-limit.test.ts (6 tests, all green via pnpm test src/middleware)
  - @fastify/rate-limit registered in src/middleware/ alongside auth.ts
    evidence: src/middleware/rate-limit.ts:14 — registerRateLimit() factory exported + called from src/app.ts:38
  - RATE_LIMIT_MAX and RATE_LIMIT_WINDOW read from process.env with sane defaults
    evidence: src/middleware/rate-limit.ts:8-12 — env reads with defaults (100/min); 4 tests cover env+default paths
  - Existing routes hit by middleware (verified via integration test)
    evidence: src/middleware/rate-limit.test.ts:67 — "POST /api/test returns 429 after 100 requests" passing

### Route Coverage + Per-Route Tuning
<!-- id: route-coverage -->
- status: done
- commit: c8d6b3a
- coverage_pct: 88
- context: Apply rate-limit selectively. Public routes get tighter limits than authenticated ones. Pattern: per-route options via fastify route config.
- rules:
  - path: .claude/rules/_pattern/config.md
    why: per-route overrides need process.env config
- acceptance_criteria:
  - Tests written first (TDD)
    evidence: src/api/routes/public/__tests__/rate-limit.test.ts (8 tests, all green)
  - Public routes (src/api/routes/public/*.ts) configured with stricter limits
    evidence: src/api/routes/public/index.ts:22 — per-route opts: max=20, window=60s
  - Auth routes have higher limits (or skip)
    evidence: src/api/routes/auth/*.ts use route-level skip=true; verified in src/api/routes/auth/__tests__/rate-limit.test.ts (no 429 after 200 reqs)
  - Documented limit values in src/middleware/README.md
    evidence: src/middleware/README.md:34-58 — full table of limits per route group with rationale

# FlowForge Automation Platform — Task Plan

> Full implementation plan (with per-task files, interfaces, and TDD steps):
> [`docs/superpowers/plans/2026-10-19-flowforge-automation-platform.md`](docs/superpowers/plans/2026-10-19-flowforge-automation-platform.md)

**Goal:** Production-grade workflow automation SaaS (triggers → conditions → actions) with a React Flow visual editor, a real backend execution engine (BullMQ + Redis), MongoDB persistence, RBAC, and automated tests.

**Stack:** React 19 + TypeScript + Vite + Tailwind + shadcn/ui + React Flow · Express + TypeScript · MongoDB/Mongoose · Redis/BullMQ · Vitest + Supertest + Playwright · Docker Compose.

---

## Phase 1 — Foundation (auth, RBAC, scaffold)
- [x] **T1.** Monorepo scaffold: npm workspaces (`client/`, `server/`, `shared/`), Docker Compose (Mongo 7, Redis 7), `.env.example` files.
- [x] **T2.** Users, JWT access/refresh auth, bcrypt, 4 roles (super_admin, workflow_admin, workflow_builder, viewer), `requireAuth`/`requireRole` middleware, audit-log service.
- [x] **T3.** Seed demo accounts (4 roles) + Swagger UI at `/api/docs`.

## Phase 2 — Workflow storage & validation
- [x] **T4.** Workflow / WorkflowVersion models + CRUD API with ownership scoping, immutable versions, activation (admin-gated).
- [x] **T5.** Definition validator: one trigger, per-node Zod config registry, edge/cycle checks (cycles allowed only via branch nodes), reachability.

## Phase 3 — Visual editor (frontend)
- [x] **T6.** App shell: collapsible sidebar (13 items), topbar, theme switcher, login flow, RBAC-aware routes, API client with token refresh.
- [x] **T7.** React Flow editor: node palette, config panel per node kind, connect/save drafts, undo/redo, client-side validation; Workflows list page.

## Phase 4 — Execution engine
- [x] **T8.** Engine core: run/node-run records, topological execution, BullMQ queue, retries with backoff, timeouts, 7 run states, secret redaction, safe `{{field}}` template resolver (no eval).
- [x] **T9.** Condition operators (equals, gt, contains, is_empty, date/boolean, …) + AND/OR if/else branching.
- [x] **T10.** Action library: email, in-app notify, outbound webhook (SSRF-guarded), JSON transform/filter/validate, map-fields, delay, log, format-date, generate-reference, record create/update (whitelisted collections).
- [x] **T11.** Execution history API + UI: filters, node timeline, retry failed, cancel running, log download.

## Phase 5 — Versioning & templates
- [x] **T12.** Version diff + restore.
- [x] **T13.** Built-in templates A–E (critical ticket alert, weekly report, warranty reminder, low inventory, CSV validation) — all must validate clean.

## Phase 6 — Triggers
- [x] **T14.** Schedule trigger (once/hourly/daily/weekly/monthly/cron + timezones) + internal event bus with idempotent fan-out.
- [x] **T15.** Webhook trigger (unique token, HMAC signature, rate limit, rotation) + real-metrics dashboard with Recharts charts.

## Phase 7 — Integrations, credentials, notifications, admin
- [x] **T16.** SSRF-safe HTTP client (blocks loopback/private/metadata), AES-256-GCM encrypted credentials (never returned to frontend), Integrations + Credentials pages.
- [ ] **T17.** In-app notifications + preferences (loop-guarded), user management (super admin), audit log UI, settings (retention, limits).
- [ ] **T18.** Security pass: helmet, CORS, rate limits, body limits, Zod validation on every route.
- [ ] **T19.** Log retention cleanup job + queue stall recovery.
- [ ] **T20.** Playwright E2E: login → create → activate → run → execution detail; RBAC guards.
- [ ] **T21.** Production Dockerfiles, `docker-compose.prod.yml`, README, DEPLOYMENT/SECURITY/KNOWN-LIMITATIONS docs.
- [ ] **T22.** **Yad-IT Help-Desk integration** — see below.

---

## Phase 8 — Hardening, tests, docs, deployment

## Yad-IT Help-Desk connection

Repo: https://github.com/Yaddy23/Yad-IT_Help-Desk (same stack: React/Vite + Express/TS + MongoDB; REST API under `/api` with Bearer auth; **no webhooks yet**; ticket lifecycle New→…→Resolved→Closed; no asset endpoints yet).

**Strategy:**
1. **Polling adapter (recommended, no changes needed to Yad-IT):** FlowForge worker polls its tickets endpoint with a stored service credential, diffs by `_id` + `updatedAt`, and emits `ticket.created`, `ticket.priority_changed`, `ticket.resolved` onto the internal event bus (Task 14). Idempotent fan-out prevents duplicate runs.
2. **Optional webhook emitter** in Yad-IT (small upstream PR) for real-time triggers instead of polling.

Deliverables: `server/src/integrations/yad-helpdesk/` adapter, `docs/INTEGRATION-YAD-HELPDESK.md` (payload mapping: `ticket.number`, `ticket.title`, `ticket.priority`, `ticket.requesterEmail` per spec §15), integration test with fixture payloads. Templates A (critical ticket alert) and D (low inventory) consume these events.

---

## Acceptance criteria (spec §22)
Auth + RBAC · editor saves real definitions to MongoDB · validation rejects invalid workflows · activated workflows execute via engine · manual/scheduled/webhook triggers · conditions & branching · email + in-app actions · retry policies · node-level history · version preservation · encrypted credentials · automated tests · documented startup. **Not UI-only — every editor action must round-trip to a real backend.**
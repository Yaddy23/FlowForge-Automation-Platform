# FlowForge Automation Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack web application called "FlowForge Automation Platform" that allows authorized users to create, configure, activate, execute, monitor, and manage automated workflows without needing to write code.

**Architecture:** The platform follows a client-server architecture with a React/Vite frontend and Node.js/Express backend. Workflows are stored in MongoDB with Mongoose ODM, and background processing is handled by Redis and BullMQ. The visual workflow editor uses React Flow for node-based workflow creation, with a modular action registry for predefined actions. Authentication uses JWT with role-based access control, and integrations are managed through secure API endpoints.

**Tech Stack:** 
- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide icons, React Router, TanStack Query, React Hook Form, Zod, React Flow, Recharts
- Backend: Node.js, Express.js, TypeScript, MongoDB, Mongoose, Redis, BullMQ, JWT, bcrypt
- Testing: Vitest, React Testing Library, Supertest, Playwright
- Dev: Docker, Docker Compose, ESLint, Prettier

**Spec:** PROJECT.md (the comprehensive requirements document provided)

## File Structure

### Frontend (client/)
- `src/` - React application source
  - `components/` - Reusable UI components
  - `pages/` - Page components for each route
  - `hooks/` - Custom React hooks
  - `utils/` - Utility functions
  - `services/` - API service clients
  - `store/` - State management (if using Redux/Zustand)
  - `types/` - TypeScript type definitions
  - `workflow-editor/` - React Flow based workflow editor components
  - `templates/` - Workflow template components
- `public/` - Static assets
- `vite.config.ts` - Vite configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration

### Backend (server/)
- `src/` - TypeScript source code
  - `controllers/` - Request handlers
  - `models/` - Mongoose models and schemas
  - `routes/` - API route definitions
  - `middleware/` - Custom middleware (auth, validation, etc.)
  - `services/` - Business logic services
  - `utils/` - Utility functions
  - `workflow-engine/` - Core workflow execution engine
  - `actions/` - Action handler implementations
  - `triggers/` - Trigger implementations
  - `conditions/` - Condition evaluators
  - `integrations/` - Integration adapters
- `tests/` - Test files
- `tsconfig.json` - TypeScript configuration
- `.env.example` - Example environment variables

### Shared
- `types/` - Shared TypeScript interfaces between frontend and backend
- `schemas/` - Shared validation schemas (Zod)

### Infrastructure
- `docker-compose.yml` - Docker Compose configuration
- `Dockerfile.client` - Frontend Dockerfile
- `Dockerfile.server` - Backend Dockerfile
- `nginx.conf` - Nginx configuration (if used)
- `README.md` - Project documentation

## Global Constraints
- Use compatible, maintained package versions
- Implement production-oriented application with real database persistence
- Visual workflow editor must save actual workflow definitions that backend can validate and execute
- Do not build a UI-only prototype
- Implement role-based access control (Super Admin, Workflow Administrator, Workflow Builder, Viewer)
- Never allow arbitrary shell commands, unrestricted database queries, or arbitrary server-side code execution
- Store credentials securely using encryption at rest
- Implement configurable retention and cleanup policies for execution logs
- Provide API documentation through OpenAPI/Swagger
- Use Docker Compose for local development
- Implement automated tests for workflow execution, validation, retries, and authorization

## Review Focus
- Invalid workflow definitions being saved to database (should be rejected by validation)
- Unauthorized access to workflows or execution data by users without proper roles
- Workflow execution engine failure to handle node timeouts or retries properly
- Credential exposure in logs or API responses
- Circular workflow dependencies causing infinite execution loops
- Webhook endpoint security vulnerabilities (SSRF, unauthorized access)
- Failed action retry mechanisms not respecting backoff policies
- Execution history not accurately reflecting node-level results
- Workflow versioning not preserving definitions for audit trail
- Integration configuration allowing access to private/internal networks without authorization

---

# Phases & Tasks

Tasks are grouped into phases matching the spec's build order: auth/storage/editor/manual execution first, then conditions/actions/history/scheduling/webhooks, then hardening/tests/docs/deployment.

## Phase 1: Foundation — Auth, RBAC, Project Scaffold

### Task 1: Monorepo scaffold with Docker Compose dev environment

**Files:**
- Create: `package.json` (root, npm workspaces `client/`, `server/`, `shared/`)
- Create: `docker-compose.yml` (services: `mongo`, `redis`, `server`, `client`, `worker`)
- Create: `server/.env.example`, `client/.env.example`
- Create: `.gitignore`, `README.md` (skeleton)

**Interfaces:**
- Produces: dev commands `docker compose up -d mongo redis`, `npm run dev` (concurrently server:3001 / client:5173). Env vars: `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `CRED_ENCRYPTION_KEY`, `PORT`, `VITE_API_URL`.

- [ ] **Step 1:** Write `docker-compose.yml` with MongoDB 7, Redis 7, healthchecks; `server/.env.example` and `client/.env.example` listing every var above.
- [ ] **Step 2:** Verify: `docker compose up -d mongo redis` → both containers healthy (`docker compose ps`).
- [ ] **Step 3:** Commit: `chore: scaffold monorepo with docker compose dev environment`.

### Task 2: User model, registration, login (JWT access/refresh), RBAC middleware

**Files:**
- Create: `server/src/models/User.ts`, `server/src/models/AuditLog.ts`
- Create: `server/src/controllers/auth.controller.ts`, `server/src/routes/auth.routes.ts`
- Create: `server/src/middleware/auth.ts` (`requireAuth`, `requireRole(...roles: Role[])`)
- Create: `shared/types/user.ts` (type `Role = 'super_admin' | 'workflow_admin' | 'workflow_builder' | 'viewer'`)
- Test: `server/tests/auth.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` returning `{ accessToken, refreshToken, user: { id, email, name, role } }`. Middleware `requireAuth(req → req.user)`, `requireRole('workflow_admin', ...)`. `logAudit({ actorId, action, targetType, targetId, meta })` in `server/src/services/audit.service.ts`.
- Consumes: Task 1 env vars (`JWT_SECRET`, `MONGODB_URI`).

- [ ] **Step 1: Write failing tests** (Supertest + mongodb-memory-server): (a) `POST /api/auth/login` with seeded user returns 200 + tokens; (b) wrong password → 401; (c) route guarded by `requireRole('super_admin')` returns 403 for `workflow_builder`; (d) valid role passes 200.
- [ ] **Step 2:** Run `npm test -w server -- auth` → FAIL (module not found).
- [ ] **Step 3:** Implement User schema (email unique index, bcrypt hash via pre-save hook, role enum), auth controller, middleware. `logAudit` writes to `auditLogs` collection.
- [ ] **Step 4:** Run tests → PASS. Commit: `feat: auth with JWT refresh, RBAC middleware, audit logging`.

### Task 3: Seed script with demo accounts + OpenAPI/Swagger setup

**Files:**
- Create: `server/src/scripts/seed.ts` (demo users: `admin@flowforge.dev`/super_admin, `wfadmin@flowforge.dev`/workflow_admin, `builder@flowforge.dev`/workflow_builder, `viewer@flowforge.dev`/viewer — password `Demo123!`, documented in README)
- Create: `server/src/docs/openapi.ts` (swagger-ui-express at `/api/docs`)
- Modify: `server/src/app.ts`

- [ ] **Step 1:** Implement seed (idempotent: upsert by email) and wire swagger with auth + workflow paths stubs.
- [ ] **Step 2:** Verify: `npm run seed -w server` prints 4 accounts; `GET /api/docs` returns Swagger UI HTML.
- [ ] **Step 3:** Commit: `feat: seed demo accounts and swagger docs endpoint`.

## Phase 2: Workflow Storage, Validation, Versions

### Task 4: Workflow + WorkflowVersion models, CRUD API with ownership scoping

**Files:**
- Create: `server/src/models/Workflow.ts`, `server/src/models/WorkflowVersion.ts`, `server/src/models/WorkflowSchedule.ts`
- Create: `server/src/controllers/workflow.controller.ts`, `server/src/routes/workflow.routes.ts`
- Create: `shared/types/workflow.ts` (types: `WorkflowDefinition { nodes: WorkflowNode[]; edges: WorkflowEdge[] }`, `WorkflowNode { id, type: NodeKind, config: Record<string, unknown> }`, `NodeKind = 'trigger.manual'|'trigger.schedule'|'trigger.webhook'|'trigger.event'|'condition'|'action.email'|'action.notify'|'action.webhook'|'action.transform'|'action.filter'|'action.validate'|'action.report'|'action.csv'|'action.delay'|'action.log'|'action.reference'|'action.record.create'|'action.record.update'|'branch'`)
- Test: `server/tests/workflow.crud.test.ts`

**Interfaces:**
- Produces: `POST/GET/PATCH/DELETE /api/workflows` (list paginated, filterable by status/owner); `POST /api/workflows/:id/versions` (save draft), `GET /api/workflows/:id/versions`, `POST /api/workflows/:id/activate` (body `{ versionId }`), `POST /api/workflows/:id/pause`. Access rules: viewers read-only; builders/admins mutate only their own unless `workflow_admin+`. Activation is restricted to `workflow_admin`+ and requires passing validation (Task 5).
- Consumes: `requireAuth`, `requireRole` from Task 2; types from `shared/types/workflow.ts`.

- [ ] **Step 1: Failing tests:** (a) builder creates workflow → 201, `status: 'draft'`, `latestVersion: 1`; (b) viewer PATCH → 403; (c) builder PATCH another builder's workflow → 403; (d) activate without validation pass → 422; (e) activating version 1 then saving draft creates version 2 while active version stays 1.
- [ ] **Step 2:** Run → FAIL. Implement models (WorkflowVersion immutable, `version: number`, `status: 'draft'|'active'|'archived'`), controller, routes.
- [ ] **Step 3:** Run → PASS. Commit: `feat: workflow CRUD with immutable versions and activation`.

### Task 5: Workflow definition validator (structure, config, cycles)

**Files:**
- Create: `server/src/services/workflow-validator.service.ts` — `validateDefinition(def: WorkflowDefinition): { valid: boolean; errors: ValidationError[] }` where `ValidationError { nodeId?, edgeId?, code, message }`
- Create: `server/src/registry/node-registry.ts` — per-NodeKind Zod config schema + category (trigger/condition/action/logic)
- Test: `server/tests/workflow-validator.test.ts`

**Interfaces:**
- Produces: `validateDefinition` checks: exactly one trigger node; every node type registered with config matching its Zod schema; every edge connects existing nodes; no cycles (DFS) unless through `branch` nodes; graph reachable from trigger; required-config fields present (e.g. `action.email` requires `to`, `subject` template). Wire into Task 4's save-draft (warnings) and activate (hard fail).
- Consumes: `shared/types/workflow.ts` NodeKind union; Zod schemas are the single source the executor (Task 8) trusts.

- [ ] **Step 1: Failing tests:** (a) def with two triggers → error code `MULTIPLE_TRIGGERS`; (b) `action.email` missing `to` → `CONFIG_INVALID` naming nodeId; (c) edge to nonexistent node → `EDGE_INVALID`; (d) cycle of `action.log` nodes → `CYCLE_DETECTED`; (e) cycle broken by `branch` → valid; (f) trigger-unreachable node → `UNREACHABLE`.
- [ ] **Step 2:** Run → FAIL. Implement registry + validator.
- [ ] **Step 3:** Run → PASS; re-run Task 4 tests → still PASS. Commit: `feat: workflow definition validation with cycle detection`.

## Phase 3: Visual Workflow Editor (frontend)

### Task 6: App shell — layout, sidebar, routing, theme switcher, auth pages

**Files:**
- Create: `client/` via Vite react-ts template; `client/src/App.tsx` with React Router routes: `/login`, `/`, `/workflows`, `/workflows/builder/:id`, `/workflows/:id/executions`, `/executions`, `/executions/:id`, `/templates`, `/scheduled`, `/integrations`, `/credentials`, `/notifications`, `/analytics`, `/users`, `/audit`, `/settings`
- Create: `client/src/components/layout/AppLayout.tsx` (collapsible sidebar with the 13 spec items, topbar with search, theme toggle, user menu), `client/src/lib/api.ts` (fetch wrapper attaching access token, auto-refresh on 401)
- Create: `client/src/pages/LoginPage.tsx`, `client/src/pages/DashboardPage.tsx` (placeholder)
- Test: `client/src/__tests__/app-shell.test.tsx`

**Interfaces:**
- Consumes: Task 2/3 auth endpoints. `api.ts` exports `apiGet<T>(path): Promise<T>`, `apiPost<T>(path, body): Promise<T>`.
- Produces: `<RequireRole roles={[...]}>` route guard; TanStack Query `QueryClientProvider`; `useAuth()` hook returning `{ user, login, logout }` (context persisted in localStorage).

- [ ] **Step 1: Failing test (RTL):** renders login, submitting demo credentials shows user name in user menu; viewer account does not render "User Management" sidebar item.
- [ ] **Step 2:** Implement shell, auth context, guards. Placeholder pages return empty-state component.
- [ ] **Step 3:** Test PASS; `npm run dev -w client` renders. Commit: `feat: app shell, auth flow, RBAC-aware navigation`.

### Task 7: React Flow editor — palette, node config panel, save to backend

**Files:**
- Create: `client/src/workflow-editor/EditorPage.tsx`, `NodePalette.tsx`, `NodeConfigPanel.tsx`, `nodes/TriggerNode.tsx` (+ per-kind styled node components), `client/src/workflow-editor/registry.ts` (mirror of `shared/types/workflow.ts` NodeKind metadata: label, icon, category, config form schema)
- Create: `client/src/components/ui/*` (shadcn/ui init: button, dialog, input, select, form, badge, tabs, toast)
- Create: `client/src/pages/WorkflowsListPage.tsx` (table, create-dialog, status badges)
- Test: `client/src/__tests__/workflow-editor.test.tsx`

**Interfaces:**
- Consumes: Task 4 workflow API; Task 5 validation errors surfaced as toasts.
- Produces: Editor saves via `PUT /api/workflows/:id/definition`-style draft-version call; React Flow nodes carry `data.kind` and `data.config`; config panel renders per-kind fields from registry.

- [ ] **Step 1: Failing test:** drag-add a trigger node + email action node, connect them, fill config, click Save → `POST /api/workflows` then version create called with expected JSON shape (mock api layer).
- [ ] **Step 2:** Implement editor (palette → drag/drop, edge connection rules: no incoming edges to triggers; validation client-side mirroring Task 5 basics; undo/redo via history stack).
- [ ] **Step 3:** Test PASS. Commit: `feat: visual workflow editor with palette, config panel, save`.

## Phase 4: Execution Engine — Manual Trigger, Conditions, Actions

### Task 8: Execution engine core — run loader, node executor, state machine

**Files:**
- Create: `server/src/models/WorkflowRun.ts`, `server/src/models/WorkflowNodeRun.ts`
- Create: `server/src/workflow-engine/engine.ts` — `executeRun(runId: string): Promise<void>`; `server/src/workflow-engine/context.ts` — `RunContext { workflow, version, run, vars, nodeOutputs, logger }`
- Create: `server/src/workflow-engine/redact.ts` — redacts keys matching `/password|secret|token|authorization|credential/i` from logs and outputs
- Create: `server/src/queues/index.ts` (BullMQ `workflow-runs` queue, `run` job `{ runId }`; `workflow-events` queue for event-trigger fan-out)
- Test: `server/tests/engine.test.ts`

**Interfaces:**
- Produces: `POST /api/workflows/:id/execute` (manual trigger; body `{ payload }`) → creates WorkflowRun (`status: 'queued'`, `trigger: { type: 'manual', payload }`, idempotencyKey `uuid`), enqueues. States: `queued|running|waiting|succeeded|failed|cancelled|timed_out`. Engine: topological walk from trigger; per-node WorkflowNodeRun record (`status`, `inputSummary`, `outputSummary`, `error`, `startedAt`, `finishedAt`, `attempts`); passes `nodeOutputs[nodeId]` via context; run timeout ms from env default 300000; per-workflow concurrency via BullMQ limiter. Template resolver `resolveTemplate('{{ticket.number}}', ctx)` in `server/src/workflow-engine/template.ts` — dot-path lookup against context only, no eval.
- Consumes: Task 4 active version, Task 5 validation, Task 2 `logAudit`.

- [ ] **Step 1: Failing tests:** (a) two-node manual workflow (trigger → `action.log`) run reaches `succeeded` with 2 nodeRuns; (b) unknown node type → run `failed` with `UNKNOWN_NODE` on that nodeRun; (c) action throwing once succeeds on retry per policy → nodeRun `attempts: 2`; (d) engine timeout → run `timed_out`; (e) template `{{payload.name}}` resolves from trigger payload; (f) payload containing `password` is redacted in outputSummary.
- [ ] **Step 2:** Run → FAIL. Implement engine, queues, redaction, template resolver.
- [ ] **Step 3:** Run → PASS. Commit: `feat: workflow execution engine with BullMQ, retries, timeouts, redaction`.

### Task 9: Condition evaluators and branching

**Files:**
- Create: `server/src/conditions/operators.ts` — operator registry: `equals, not_equals, gt, lt, contains, not_contains, starts_with, ends_with, is_empty, is_not_empty, date_before, date_after, is_true, is_false`; `evaluateCondition({ left, operator, right }, ctx): boolean`
- Create: `server/src/workflow-engine/handlers/condition.ts` + `handlers/branch.ts` (if/else + true/false routing; branch carries conditions with AND/OR combinator)
- Test: `server/tests/conditions.test.ts`, `server/tests/engine-branching.test.ts`

**Interfaces:**
- Produces: branch node config `{ branches: [{ id, conditions: [{ leftPath, operator, right }], combinator: 'and'|'or' }], fallbackBranchId }`; engine follows only the matching outgoing edge(s). Config validated by Task 5 registry (operator must exist; `leftPath` non-empty).
- Consumes: `RunContext` + `resolveTemplate` from Task 8.

- [ ] **Step 1: Failing tests:** (a) every operator unit-tested incl. date compare and boolean; (b) engine test: ticket workflow — priority `critical` → email node runs, else-path skipped; combinator `and` with one false condition → fallback branch.
- [ ] **Step 2:** Run → FAIL. Implement operators, condition/branch handlers; register in Task 5 registry.
- [ ] **Step 3:** Run → PASS (incl. Task 5 + 8 regressions). Commit: `feat: condition operators and if/else branching`.

### Task 10: Action library — notifications, data, utility

**Files:**
- Create: `server/src/actions/registry.ts` — `ActionHandler = (config: any, ctx: RunContext) => Promise<{ output: Record<string, unknown> }>`; `registerAction(kind, handler)`
- Create: `server/src/actions/email.ts` (uses `server/src/services/mailer.ts` — nodemailer, provider config from systemSettings), `notify.ts` (creates Notification doc), `webhook-out.ts` (goes through Task 16 URL guard), `transform.ts`, `filter.ts`, `validate-data.ts` (AJV), `map-fields.ts`, `delay.ts` (BullMQ delayed continuation → run `waiting`), `log.ts`, `format-date.ts` (dayjs + tz), `generate-reference.ts` (e.g. `FF-<base36 ts>-<rand4>`)
- Test: `server/tests/actions.test.ts`

**Interfaces:**
- Produces: each action's Zod config schema added to Task 5 registry; `action.record.create`/`update` operate only on whitelisted collections defined in `server/src/config/allowed-records.ts`. No shell/eval anywhere — enforced by registry design.
- Consumes: Task 8 ctx/registry; Task 16 `assertSafeUrl` (stub `ok(url)` until Task 16, replaced then).

- [ ] **Step 1: Failing tests:** per action: config-schema rejection case + happy-path output shape; email asserts mailer mock called with rendered `{{...}}` templates; delay transitions run to `waiting` then resumes.
- [ ] **Step 2:** Implement. Step 3: PASS. Commit: `feat: action library (notifications, data, utility)`.

### Task 11: Execution history API + detail UI

**Files:**
- Create: `server/src/controllers/runs.controller.ts`, `server/src/routes/runs.routes.ts` — `GET /api/runs` (filters: workflowId, status, trigger, date range, pagination), `GET /api/runs/:id` (with nodeRuns), `POST /api/runs/:id/retry` (failed node, eligible only), `POST /api/runs/:id/cancel`, `GET /api/runs/:id/logs` (download NDJSON)
- Create: `client/src/pages/ExecutionsListPage.tsx`, `client/src/pages/ExecutionDetailPage.tsx` (node timeline, status badges, input/output summaries, retry/cancel buttons, log download)
- Test: `server/tests/runs.api.test.ts`

**Interfaces:**
- Consumes: Task 8 models. Retry re-enqueues with `attempts` reset for failed node only; cancel sets BullMQ job removed + run `cancelled`. Secrets redacted (Task 8) — test asserts no credential value in API response.
- Produces: feeds Dashboard (Task 15) and Analytics.

- [ ] **Step 1: Failing tests:** (a) list paginated + filterable; (b) viewer can read, cannot retry (403); (c) retry only on `failed`/`timed_out`; (d) cancel on `running` → `cancelled`; (e) API response of a run containing `authorization` in payload omits it.
- [ ] **Step 2:** Implement API + pages. Step 3: PASS. Commit: `feat: execution history, retry, cancel, log download`.

## Phase 5: Versioning UI, Templates

### Task 12: Version compare/restore + workflow detail page

**Files:**
- Create: `server/src/controllers/versions.controller.ts` — `GET /api/workflows/:id/versions/:v1/diff/:v2` (node/edge set diff), `POST /api/workflows/:id/versions/:v/restore` (copies to new draft version)
- Create: `client/src/pages/WorkflowDetailPage.tsx` (versions tab, diff view, restore button, activate/pause)

- [ ] **Step 1: Failing test:** activating v1, editing to v2, restore v1 → new draft v3 identical to v1 (deep equal), active version still v1.
- [ ] **Step 2:** Implement. Step 3: PASS. Commit: `feat: version diff and restore`.

### Task 13: Built-in templates A–E

**Files:**
- Create: `server/src/models/WorkflowTemplate.ts`, `server/src/data/templates/*.ts` (Templates A–E from spec as valid definitions), `server/src/routes/templates.routes.ts` (`GET /api/templates`, `POST /api/templates/:id/instantiate` → creates user's draft workflow)
- Test: `server/tests/templates.test.ts`

**Interfaces:**
- Consumes: Task 5 `validateDefinition` — every template must validate clean (test asserts this); internal-event trigger names (`ticket.created`, `ticket.priority_changed`, `inventory.low`, `asset.warranty_expiring`) defined in Task 14 event registry.
- Produces: seed script (Task 3) inserts templates on `npm run seed`.

- [ ] **Step 1: Failing test:** all 5 templates pass `validateDefinition`; instantiate creates editable draft for current user.
- [ ] **Step 2:** Implement + wire into seed. Step 3: PASS. Commit: `feat: built-in workflow templates A-E`.

## Phase 6: Scheduled, Webhook, and Internal-Event Triggers

### Task 14: Schedule trigger + internal event system

**Files:**
- Create: `server/src/triggers/scheduler.ts` (BullMQ repeatable jobs from `workflowSchedules`: once/hourly/daily/weekly/monthly/cron with IANA timezone validation; re-syncs on activation/pause)
- Create: `server/src/triggers/events.ts` — `publishEvent({ name, payload })` writes to `workflow-events` queue; `EVENT_REGISTRY` (ticket.*, asset.*, inventory.*, user.account_deactivated); engine matches active workflows with `trigger.event` nodes
- Test: `server/tests/schedule.test.ts`, `server/tests/events.test.ts`

**Interfaces:**
- Produces: `GET /api/scheduled` (upcoming runs), `POST /api/events` (internal, service-auth only). Idempotency: event fan-out dedupes on `eventId`.
- Consumes: Task 8 engine; Task 4 activation hooks call `syncSchedules(workflowId)`.

- [ ] **Step 1: Failing tests:** (a) hourly schedule enqueues and fires a run within test window (fake timers / short repeat); (b) invalid cron rejected at activation; (c) `publishEvent('ticket.created', …)` creates one run per matching workflow, none for non-matching; (d) duplicate eventId → single run.
- [ ] **Step 2:** Implement. Step 3: PASS. Commit: `feat: schedule trigger with timezones and internal event bus`.

### Task 15: Webhook trigger + dashboard/analytics

**Files:**
- Create: `server/src/triggers/webhook.ts` — `POST /api/webhooks/:token` (HMAC signature verify optional via header, per-workhook secret, rotation endpoint `POST /api/workflows/:id/webhook/rotate`, rate-limited, request log doc)
- Create: `server/src/controllers/analytics.controller.ts` (`GET /api/analytics/summary|volume|failure-categories|top-workflows` — all aggregations, zero hardcoded numbers)
- Create: `client/src/pages/DashboardPage.tsx` (stat cards + Recharts charts + date/status/owner filters), `client/src/pages/ScheduledRunsPage.tsx`
- Test: `server/tests/webhook.test.ts`, `server/tests/analytics.test.ts`

**Interfaces:**
- Consumes: Task 8 engine. Webhook signature: HMAC-SHA256 of raw body with workflow webhook secret, header `X-FlowForge-Signature`.
- Note: `dataviz` skill should be consulted when styling the dashboard charts.

- [ ] **Step 1: Failing tests:** (a) webhook fires run and stores payload; (b) bad signature → 401 (when configured); (c) rate limit exceeded → 429; (d) rotate invalidates old token; (e) analytics summary matches fixtures.
- [ ] **Step 2:** Implement. Step 3: PASS. Commit: `feat: webhook triggers with signature verification; real-metrics dashboard`.

## Phase 7: Integrations, Credentials, Notifications, Users

### Task 16: SSRF-safe HTTP client, integrations + encrypted credentials

**Files:**
- Create: `server/src/utils/safe-url.ts` — `assertSafeUrl(url: string, opts: { allowPrivate?: boolean }): URL` (blocks loopback/private/link-local/metadata IPs via DNS-resolved checks, http/https only, size/time limits enforced at fetch)
- Create: `server/src/models/Integration.ts`, `server/src/models/EncryptedCredential.ts` (AES-256-GCM with `CRED_ENCRYPTION_KEY`), `server/src/services/credentials.service.ts` (`encrypt`, `decrypt`, `rotate`, `revoke`; decrypt never leaves server)
- Create: `server/src/controllers/integrations.controller.ts` (`GET/POST/PATCH/DELETE /api/integrations`, `/credentials` — responses contain `hasCredential: true`, never values), connection `POST /api/integrations/:id/test`
- Create: `client/src/pages/IntegrationsPage.tsx`, `client/src/pages/CredentialsPage.tsx`
- Test: `server/tests/safe-url.test.ts`, `server/tests/credentials.test.ts`

**Interfaces:**
- Produces: `assertSafeUrl` replaces Task 10's stub. Admin flag `ALLOW_PRIVATE_TARGETS` (default false) for explicitly authorized private access.
- Consumes: Task 2 RBAC (credentials page `workflow_admin`+).

- [ ] **Step 1: Failing tests:** (a) `http://127.0.0.1` → throws; (b) `http://169.254.169.254` → throws; (c) hostname resolving to private IP → throws (mock DNS); (d) credential save → response has no secret field; (e) rotate changes ciphertext; (f) revoke marks unusable.
- [ ] **Step 2:** Implement. Step 3: PASS. Commit: `feat: SSRF-safe HTTP, encrypted credentials, integrations UI`.

### Task 17: In-app notifications, preferences, user management, audit log UI

**Files:**
- Create: `server/src/models/Notification.ts`, `server/src/controllers/notifications.controller.ts` (list, mark-read, preferences upsert; failure/completion alerts emitted by engine hooks with loop-guard: notification actions don't trigger `workflow.completed` alerts for the same run)
- Create: `server/src/controllers/users.controller.ts` (super_admin only: CRUD, role change), `server/src/controllers/audit.controller.ts` (list w/ filters)
- Create: `client/src/pages/NotificationsPage.tsx`, `UserManagementPage.tsx`, `AuditLogPage.tsx`, `SettingsPage.tsx` (systemSettings: retention days, concurrency limits)
- Test: `server/tests/notifications.test.ts`, `server/tests/users.test.ts`

- [ ] **Step 1: Failing tests:** (a) failed run creates in-app notification for workflow owner; (b) loop-guard: no notification storm; (c) non-super-admin on /api/users → 403; (d) audit entries written for activation/role-change.
- [ ] **Step 2:** Implement. Step 3: PASS. Commit: `feat: notifications with preferences, user management, audit UI`.

## Phase 8: Hardening, E2E, Docs, Deployment

### Task 18: Security hardening pass

**Files:**
- Modify: `server/src/app.ts` — helmet, CORS allowlist, `express-rate-limit` (global + stricter on auth/webhook), body size limits, request-id + structured error handler (no stack traces to client)
- Modify: `server/src/middleware/*` — verify every route has `requireAuth` + `requireRole` coverage; add param/query Zod validation middleware on all routes
- Test: `server/tests/security.test.ts`

- [ ] **Step 1: Failing tests:** unauthenticated request to every protected route family → 401; oversize body → 413; malformed query params → 400; rate-limit trip → 429.
- [ ] **Step 2:** Implement. Step 3: PASS + full suite green. Commit: `chore: security hardening (helmet, rate limits, validation coverage)`.

### Task 19: Retention cleanup + queue recovery

**Files:**
- Create: `server/src/jobs/retention.ts` (BullMQ repeatable: delete workflowNodeRuns/runs/logs older than systemSettings retention; keep nodeRuns summary)
- Verify: engine recovery — worker restart with in-flight job: BullMQ stalled-job handling re-runs; test asserts run not marked succeeded on restart.

- [ ] **Step 1: Failing test:** seed old runs, run cleanup job, assert old purged & recent kept. Step 2: implement. Step 3: PASS. Commit: `feat: log retention policies and queue stall recovery`.

### Task 20: E2E tests (Playwright) — critical paths

**Files:**
- Create: `e2e/login.spec.ts`, `e2e/workflow-create-run.spec.ts`, `e2e/rbac.spec.ts`
- Create: `playwright.config.ts`, CI-friendly compose profile (`docker compose --profile e2e up`)

- [ ] **Step 1:** Login as builder → create workflow from template A → activate (as admin) → run manually → see succeeded execution detail.
- [ ] **Step 2:** Viewer blocked from editor routes; builder blocked from User Management.
- [ ] **Step 3:** PASS against compose stack. Commit: `test: playwright e2e for critical paths`.

### Task 21: Dockerfiles, production docs, final README

**Files:**
- Create: `server/Dockerfile`, `client/Dockerfile` (multi-stage, non-root user), production compose override (`docker-compose.prod.yml`), `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/KNOWN-LIMITATIONS.md`
- Modify: `README.md` — full setup, demo accounts, env vars, node-type reference table, backup/restore (mongodump) notes
- Verify: `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` succeeds; fresh clone instructions work end-to-end.

- [ ] **Step 1:** Write files. Step 2: build + smoke-test containers. Step 3: Commit: `docs: deployment, security notes, production compose`.

### Task 22: Integration with Yad-IT Help-Desk

**Files:**
- Create: `server/src/integrations/yad-helpdesk/index.ts` — adapter implementing the Task 14 event interface: subscribes to Yad-IT Help-Desk ticket events (ticket created / priority changed / resolved, asset events) via its webhook or polling API and calls `publishEvent(...)`
- Create: `docs/INTEGRATION-YAD-HELPDESK.md` — setup: register FlowForge webhook URL in Yad-IT Help-Desk (or configure its API base URL + credential in Integrations page), map its ticket payload → FlowForge event registry names, secret config
- Test: `server/tests/yad-integration.test.ts` (fixture payloads from the Yad-IT Help-Desk API → correct `publishEvent` calls)

**Interfaces:**
- Consumes: Task 14 event registry + `publishEvent`; Task 16 credentials service (store Yad-IT API key as encrypted credential); Templates A/D target these events.
- **Grounded findings (verified 2026-10-19):** Yad-IT Help-Desk uses the same stack (React 19/Vite, Express/TS/Mongoose, MongoDB, JWT + bcryptjs, Vitest/Supertest). Its REST API lives under `/api` (auth, tickets CRUD + comments/activities/SLA status, SLA policies, notifications, users). **It has no webhooks today** — all routes require a Bearer token. Its ticket lifecycle: New → Open → Assigned → In Progress → waiting → Resolved → Closed (+ Escalated, Cancelled). No asset/inventory endpoints exist yet despite the "asset management" title. Demo seed accounts: super_admin / it_tech / employee, password `Password123!`.

**Integration strategy (in order of preference):**
1. **Polling adapter (no changes to Yad-IT needed):** FlowForge worker polls `GET /api/tickets?updatedAt>=<last-check>` using a stored Yad-IT service credential; new/changed tickets are diffed and mapped to `ticket.created` / `ticket.priority_changed` / `ticket.resolved` events; dedupe on ticket `_id` + `updatedAt`.
2. **Add a webhook emitter to Yad-IT** (small PR to that repo): on ticket create/priority-change/resolve, POST signed payload to FlowForge `POST /api/webhooks/:token`; map `status`, `priority`, `title`, `requester` fields.

- [ ] **Step 1:** Clone Yad-IT Help-Desk repo (`feature/ticket-management` branch), read `docs/API.md` and ticket routes to confirm exact field names; document mapping in `docs/INTEGRATION-YAD-HELPDESK.md`.
- [ ] **Step 2: Failing test:** fixture ticket payload from its actual API shape → `publishEvent` called with `ticket.created` and mapped fields (`ticket.number`, `ticket.title`, `ticket.priority`, `ticket.requesterEmail` matching the spec §15 example).
- [ ] **Step 3:** Implement polling adapter (option 1). Step 4: PASS. Step 5: Commit: `feat: yad-it-helpdesk ticket event integration`.

## Self-Review Notes

- **Spec coverage:** Phases 1–8 map to spec sections 3–22; acceptance criteria 1–13 covered by Tasks 2 (1), 7 (2, 3), 5 (4), 8 (5), 14/15 (6), 9 (7), 10+17 (8), 8/19 (9), 11 (10), 12 (11), 16 (12), 20 (13), 21 (14).
- **Type consistency:** `NodeKind`, `validateDefinition`, `executeRun`, `publishEvent`, `assertSafeUrl`, `registerAction` are each defined once and referenced by exact name in consuming tasks.
- **Review Focus pins:** each Review Focus line is exercised by a named test in Tasks 5 (invalid defs, cycles), 2/11/17 (authz), 8 (timeouts/retries, redaction), 16 (SSRF), 4 (versioning), 14 (idempotency).

# LendLoop

> **Neighborhood tool-lending board.** A full-stack, type-safe web application where neighbors share tools within their community. Built with Next.js App Router, Clerk authentication, Convex reactive backend, and self-hosted n8n automation.

Convex serves as the single source of truth and enforces all validation, authorization, and business rules. n8n operates purely as a message router and polling coordinator with zero business logic.

---

## 1. Overview & Quick Verification

### Stack Summary

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS | Server-rendered pages, reactive client components, strict CSP |
| **Authentication** | Clerk (Core 3 `@clerk/nextjs`) | Session tokens, passkeys/social login, OIDC sync with Convex |
| **Backend & Database** | Convex 1.50 | Reactive queries & mutations, ACID transactions, HTTP actions, outbox delivery |
| **Automation & Jobs** | Self-hosted n8n (Docker Compose) | Asynchronous webhook delivery, daily overdue polling, email notifications |
| **Testing** | Vitest + `convex-test` | 160 unit, integration, and security tests run against in-memory backend |
| **End-to-End (E2E)** | Playwright + `@clerk/testing` | 13 headless Chromium browser specs across public, auth, admin, and loan lifecycle |
| **Security & Cryptography** | Web Crypto (`crypto.subtle`) + Node `crypto` | Bidirectional constant-time HMAC-SHA256 request signing and verification |

### Zero-API-Key Local Verification

Reviewers can verify the entire backend logic, state machine, and authorization suite locally without configuring any external services or API keys:

```bash
# 1. Install dependencies
npm install

# 2. Run TypeScript type check (strict mode)
npm run typecheck

# 3. Run all 160 backend, HTTP, auth, and state machine tests
npm test

# 4. Run secret scan gate
bash scripts/check-secrets.sh
```

---

## 2. Architecture

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER CLIENT                                   |
|   Next.js App Router (React 19) + Clerk Auth SDK + Reactive Convex React Client   |
+----------------------------------------+------------------------------------------+
                                         |
                       Reactive WebSocket / HTTPS queries & mutations
                       OIDC Identity Token (Bearer JWT)
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                                  CONVEX BACKEND                                   |
|                      (Single Source of Truth & Rule Engine)                       |
|                                                                                   |
|  - Auth & Guard: requireActiveUser, SessionGuard, requireAdmin, BOLA/BFLA guards  |
|  - Domain Modules: users.ts, tools.ts, loans.ts, admin.ts, automation.ts         |
|  - Database: Indexed document store (users, tools, loans, automationEvents)       |
|  - Outbox Scheduler: ctx.scheduler.runAfter (non-blocking webhook delivery)       |
|  - HTTP Router: /overdue-loans, /reminder-result (HMAC-SHA256 verified)           |
+-------------------+-------------------------------------------+-------------------+
                    |                                           ^
       Contract A   | Outbound Webhooks            Contract B   | Inbound Poll (GET)
   X-LL-Signature   | (Async scheduled action)  X-LL-Signature  | Contract C (POST)
                    v                                           |
+---------------------------------------------------------------+-------------------+
|                                 SELF-HOSTED n8n                                   |
|                                (Docker Container)                                 |
|                                                                                   |
|  - Workflow 1: Loan Events Webhook (HMAC verification, routing, email template)   |
|  - Workflow 2: Daily Overdue Reminders (Cron, signed GET /overdue-loans, writeback)|
|  - Workflow 3: Global Error Handler (Sanitizes errors, suppresses PII)            |
+----------------------------------------+------------------------------------------+
                                         |
                                         | SMTP / Email Notification
                                         v
                        [ Neighbor / Borrower Mailbox ]
```

### Codebase Layout

```
lendloop/
├── app/                       # Next.js App Router routes
│   ├── (dashboard)/           # Protected dashboard layout & routes (inbox, listings, requests)
│   ├── admin/                 # Admin panel (user management, trusted lenders, audit tables)
│   ├── how-it-works/          # Public documentation & FAQ
│   ├── login/                 # Clerk sign-in / sign-up routing
│   ├── privacy/ & terms/      # Legal & data privacy terms
│   ├── layout.tsx             # Root layout with CSP & ClerkProvider
│   ├── page.tsx               # Public tool catalog with category filters & search
│   ├── providers.tsx          # Clerk + ConvexProviderWithClerk wrapper
│   └── proxy.ts               # Security headers & proxy middleware
├── components/                # Modular React client & server components
│   ├── account/               # User settings & privacy-preserving account deletion modal
│   ├── admin/                 # Admin user table, loan monitor, and status badges
│   ├── auth/                  # SessionGuard (reactive token revocation listener)
│   ├── dashboard/             # Inbox, loans table, listings manager, tool creation dialog
│   └── Navbar.tsx             # Responsive header with Clerk UserButton & navigation links
├── convex/                    # Backend server functions, schema & business logic
│   ├── lib/                   # Shared backend utilities (auth, hmac, state machine, validators)
│   ├── tests/                 # Vitest test suite (users, tools, loans, admin, http)
│   ├── admin.ts               # Admin-only mutations & queries
│   ├── auth.config.ts         # Clerk OIDC JWT verification configuration
│   ├── automation.ts          # Outbox event insertion & scheduled webhook dispatcher
│   ├── http.ts                # Convex HTTP router (/overdue-loans, /reminder-result)
│   ├── loans.ts               # Loan lifecycle state machine & overlap validation
│   ├── schema.ts              # Strongly-typed database schema & indexes
│   ├── tools.ts               # Tool catalog CRUD & availability projections
│   └── users.ts               # User profile sync, roles, and self-delete logic
├── docs/                      # Architectural specifications & contracts
│   ├── CONTRACTS.md           # Formal integration contracts between Convex & n8n (A, B, C)
│   ├── SPEC.md                # Backend domain rules, schema definitions & validation limits
│   └── PRODUCTION.md          # Production architecture & cloud migration guide
├── e2e/                       # Playwright test suite (13 specs)
│   ├── global.setup.ts        # Clerk testing token setup
│   ├── public-and-security.spec.ts  # CSP headers, unauthenticated redirects, catalog browsing
│   ├── auth-and-admin.spec.ts       # Authenticated dashboard, admin role enforcement, self-delete
│   └── loan-lifecycle.spec.ts       # End-to-end multi-role tool request & approval flow
├── n8n/                       # Automation service deliverables
│   ├── code-nodes/            # Reusable Node.js HMAC verification & signing scripts
│   ├── workflows/             # Scrubbed workflow JSONs (Loan Events, Overdue, Error Handler)
│   ├── docker-compose.yml     # Self-hosted n8n container definition
│   └── README.md              # Detailed workflow import & execution instructions
└── scripts/                   # Developer & audit tooling
    ├── check-secrets.sh       # Git pre-commit secret scanner
    ├── mock-receiver.ts       # Standalone Node.js HMAC webhook receiver for dev testing
    ├── seed-overdue.ts        # Overdue loan derivation test helper
    └── sign.ts                # CLI HMAC-SHA256 signature generator for curl testing
```

---

## 3. Local Setup (App + Convex + n8n)

### Step 1: Prerequisites
- **Node.js**: v20 or higher (`node -v`)
- **Docker & Docker Compose**: For running self-hosted n8n
- **Clerk Account**: Free development tier at [clerk.com](https://clerk.com)

### Step 2: Clone & Configure Environment
Clone the repository, install dependencies, and create your local environment file:

```bash
git clone <repo-url> lendloop
cd lendloop
npm install
cp .env.example .env.local
```

#### Clerk Configuration Note
1. In your [Clerk Dashboard](https://dashboard.clerk.com), navigate to **Configure &rarr; JWT Templates**.
2. Click **New Template**, select **Convex**, and name the template `convex` (all lowercase).
3. Copy the **Issuer URL** (e.g. `https://your-app.clerk.accounts.dev`) and set it as `CLERK_JWT_ISSUER_DOMAIN` in both `.env.local` and your Convex deployment environment variables.
4. **Important:** In Clerk Dashboard under **User & Authentication &rarr; Email, Phone, Username &rarr; Delete user account**, ensure client-side self-deletion is **disabled**. LendLoop enforces privacy-preserving account deletion inside Convex (`deleteMyAccount`) to ensure users cannot delete their profile while holding active loans.

### Step 3: Start Convex Backend
In a dedicated terminal, launch the local Convex development server:

```bash
npx convex dev
```

On first run, this connects to your personal Convex project and provides your `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_SITE_URL`.

Set your Convex deployment environment variables (either in the Convex Dashboard under **Settings &rarr; Environment Variables** or via CLI):

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-app.clerk.accounts.dev"
npx convex env set ADMIN_SEED_EMAIL "your-admin-email@example.com"
npx convex env set N8N_WEBHOOK_URL "http://localhost:5678/webhook/lendloop-loan-events"
npx convex env set N8N_WEBHOOK_SECRET "lendloop-webhook-secret"
npx convex env set N8N_API_SECRET "lendloop-api-secret"
```

### Step 4: Start Next.js Frontend
In a second terminal, start the Next.js development server (or test the production build):

```bash
# Development mode
npm run dev

# OR Local production build & run
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 5: Start n8n Automation Engine
In a third terminal, start self-hosted n8n via Docker Compose:

```bash
docker compose up -d
```

1. Open `http://localhost:5678` and finish the quick initial admin account setup.
2. In n8n, click **Import from file** and import all 3 workflow files from `n8n/workflows/`:
   - `n8n/workflows/error-handler.json` &rarr; Activate as `LendLoop Error Handler`
   - `n8n/workflows/request-notification.json` &rarr; Activate as `LendLoop Loan Events` (link error workflow)
   - `n8n/workflows/overdue-reminders.json` &rarr; Activate as `LendLoop Overdue Reminders` (link error workflow)
3. Set n8n environment variables in your container environment or `docker-compose.yml`:
   - `LENDLOOP_WEBHOOK_SECRET=lendloop-webhook-secret`
   - `LENDLOOP_API_SECRET=lendloop-api-secret`
   - `CONVEX_SITE_URL=http://host.docker.internal:3211`

### Step 6: Run Full Verification Gates

```bash
# 1. Typecheck (zero TS errors)
npm run typecheck

# 2. Unit, integration & security test suite (160 tests passing)
npm test

# 3. Playwright E2E browser tests (13 tests passing)
npm run test:e2e

# 4. Git secret & hygiene scanner
bash scripts/check-secrets.sh
```

---

### Environment Variables Reference

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | **Yes** | Client WebSocket/HTTP URL for Convex (e.g. `http://127.0.0.1:3210`) |
| `CONVEX_SITE_URL` | `.env.local`, n8n | **Yes** | Base URL for Convex HTTP router actions (e.g. `http://localhost:3211` or `http://host.docker.internal:3211`) |
| `ADMIN_SEED_EMAIL` | Convex Env | **Yes** | Email address automatically promoted to `role: "admin"` upon initial sign-in |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | **Yes** | Clerk frontend client key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | `.env.local` | **Yes** | Clerk backend secret key (`sk_test_...`) |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex Env | **Yes** | Issuer domain used to validate OIDC JWTs in `auth.config.ts` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `.env.local` | Optional | Set to `/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `.env.local` | Optional | Set to `/login` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `.env.local` | Optional | Set to `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `.env.local` | Optional | Set to `/dashboard` |
| `N8N_WEBHOOK_URL` | Convex Env | **Yes** | Outbound endpoint called by Convex on loan lifecycle events |
| `N8N_WEBHOOK_SECRET` | Convex Env, n8n | **Yes** | HMAC-SHA256 secret for signing outbound webhooks (Contract A) |
| `N8N_API_SECRET` | Convex Env, n8n | **Yes** | HMAC-SHA256 secret for authenticating inbound calls to Convex (Contracts B & C) |
| `E2E_BASE_URL` | `.env.local` | Optional | Base URL for Playwright tests (defaults to `http://localhost:3000`) |
| `E2E_ADMIN_EMAIL` | `.env.local` | Optional | Admin account email for authenticated Playwright specs |
| `E2E_USER_EMAIL` | `.env.local` | Optional | Member account email for authenticated Playwright specs |
| `CLERK_TESTING_TOKEN` | `.env.local` | Optional | Testing token from Clerk dashboard for headless E2E auth |

---

## 4. Integration Design, Reliability & Error Handling (n8n)

LendLoop implements a strict two-way contract between Convex and n8n as defined in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

### 1. Outbound Loan Event Webhooks (Contract A)
- **Asynchronous Scheduled Execution:** When a loan changes state (`loan.requested`, `loan.approved`, `loan.declined`, `loan.cancelled`, `loan.returned`), the mutation inserts an event record into the `automationEvents` outbox and dispatches delivery via `ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId })`.
- **User Mutation Isolation:** User mutations commit instantly in Convex with ACID durability. Webhook delivery runs out-of-band; if n8n is offline or unreachable, user requests never block or fail.
- **Convex Retries:** If n8n returns a transient error (`5xx`, `408`, `429`, or network failure), Convex automatically retries up to 5 times with exponential backoff (`30s`, `2m`, `10m`, `1h`, `6h`). Non-retryable errors (`400`, `401`) immediately transition the event to `failed` without wasted retries.

### 2. Inbound Overdue Loan Polling (Contract B & C)
- **Contract B (`GET /overdue-loans`):** n8n triggers a daily schedule cron that computes an HMAC-SHA256 signature and requests overdue loans from Convex. Overdue loans are calculated at query time (`status === "approved" && endDate < today && returnedAt === undefined`).
- **Contract C (`POST /reminder-result`):** For each processed borrower, n8n signs a write-back request containing a deterministic UTC date key: `idempotencyKey: "{loanId}:{YYYY-MM-DD}"`.
- **Convex Idempotency:** The `automation.recordReminder` mutation uses `by_idempotencyKey` to guarantee that duplicate webhook deliveries within the same day are recorded once without duplicate notifications.

### 3. Failure Isolation & Global Error Workflow
- **PII-Free Error Alerts:** `n8n/workflows/error-handler.json` acts as the global error workflow. It intercepts failures and strips all email addresses, recipient names, and raw request bodies before emitting alerts.
- **Fail-Closed Signatures:** Inbound requests with missing or expired timestamps (`|now - ts| > 300s`) or invalid HMAC signatures are rejected with HTTP 401 `{ "error": "unauthorized" }`. No stack traces or cryptographic validation details are leaked to callers.

---

## 5. Security & Data-Minimization Decisions

Security and privacy are designed directly into the architecture:

### Security Controls
1. **DB-Backed Session Validation (`requireActiveUser` & `SessionGuard`):**
   Stateless JWTs suffer from a revocation window if an account is suspended or deleted. LendLoop pairs every authenticated mutation with a DB-backed status check (`requireActiveUser`). On the client, `SessionGuard` reactively monitors user status and signs out deactivated users immediately.
2. **Broken Object/Function Level Authorization (BOLA / BFLA) Defense:**
   - There is no public `loans.get(loanId)`. All loan reads (`getParticipantLoan`) enforce that the caller is strictly either the borrower or the tool owner.
   - All state transitions (`approve`, `decline`, `markReturned`) verify owner identity. Cancellation verifies borrower identity.
   - Admin functions (`admin.ts`) enforce `requireAdmin`, which reads the verified role directly from the `users` table (never from client claims or arguments) and blocks self-demotion or self-suspension.
3. **Bidirectional Constant-Time HMAC-SHA256:**
   Outbound webhooks and inbound API routes verify HMAC signatures over `${timestamp}.${method}.${path}.${rawBody}` using `crypto.subtle` in Convex and `crypto.timingSafeEqual` in Node.js, eliminating timing attacks. A 300-second replay window rejects stale requests.
4. **Rate Limiting & Input Sanitization:**
   - Tool creation and loan requests are rate-limited to 15 actions per user per hour via indexed database counters.
   - Tool IDs and Loan IDs are validated using `ctx.db.normalizeId`.
   - String inputs are trimmed and bounded (names &le; 80 chars, descriptions &le; 500 chars).
5. **Hardened HTTP Headers & CSP:**
   `next.config.js` and `proxy.ts` configure strict Content Security Policy (restricting scripts to Clerk and connections to Convex), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `poweredByHeader: false`.

### Data Minimization Controls
1. **Minimal Webhook Payloads:**
   Outbound n8n payloads contain only the exact fields necessary to render the notification email (`loanId`, `toolName`, `startDate`, `endDate`, `recipient`). Internal user IDs, Clerk auth identifiers, role levels, and descriptions are omitted.
2. **Least-Privilege Query Projections:**
   The public catalog (`tools.ts:listPublic`) strips owner email addresses and internal listing timestamps. Only public tool metadata and owner display names are returned to browsers.
3. **Privacy-Preserving Account Deletion:**
   When a user deletes their account (`users.ts:deleteMyAccount`), deletion is blocked if they have active or unreturned loans. Once verified clear, all personal data is scrubbed: `name` becomes `"Deleted User"`, and `email` is scrambled to `deleted+<id>@neighborhood.local`. Historical loan ledgers remain intact for the community without retaining any personal data.
4. **Zero-Secret Repository Hygiene:**
   All exported n8n workflow JSON files are scrubbed of live credentials. An automated scanner (`scripts/check-secrets.sh`) verifies that no `.env` files are tracked and `.env.example` contains zero populated secrets.

---

## 6. What I Would Change for Production

For a high-volume, enterprise production deployment, I would implement the following architectural enhancements:

1. **Transactional Outbox & Dead-Letter Queue (DLQ):**
   Replace Convex's in-memory scheduled actions with a persistent `webhook_outbox` table using two-phase commit. Run a dedicated queue consumer with exponential backoff, jitter, and an administrative Dead-Letter Queue (DLQ) with manual replay capabilities for failed webhooks.
2. **Dedicated Transactional Email Service:**
   Replace single-container n8n SMTP nodes with a dedicated transactional email provider (such as Resend or Postmark) featuring verified custom domains (SPF, DKIM, DMARC), bounce tracking, and webhook delivery status callbacks.
3. **Managed Cloud Infrastructure & Custom Domain Auth:**
   Deploy Next.js on Vercel and backend on Convex Cloud (`npx convex deploy`). Migrate Clerk to a production instance with custom domain cookies (`auth.lendloop.org`), enterprise SSO, and Cloudflare Turnstile bot detection.
4. **Edge Rate Limiting & Web Application Firewall (WAF):**
   Complement Convex's database rate limits with edge-level rate limiting using Upstash Redis inside `proxy.ts` or Cloudflare WAF rules to drop volumetric abuse before it reaches database workers.
5. **Centralized Observability & Distributed Tracing:**
   Instrument Next.js, Convex, and n8n with OpenTelemetry and Sentry. Propagate a `traceparent` correlation ID across the entire lifecycle (HTTP request &rarr; Convex mutation &rarr; webhook payload &rarr; n8n execution &rarr; email dispatch) for end-to-end debugging.
6. **Dual-Key Secret Rotation:**
   Upgrade HMAC verification to support key rotation with primary and secondary secrets (`N8N_WEBHOOK_SECRET_PRIMARY`, `N8N_WEBHOOK_SECRET_SECONDARY`) backed by AWS Secrets Manager or HashiCorp Vault.
7. **Domain Hardening & Timezone-Aware Scheduling:**
   Store user IANA timezones (`Intl.DateTimeFormat`) so overdue calculations and reminder emails trigger relative to the neighbor's local timezone (e.g. 09:00 AM local time) rather than a uniform UTC midnight cutoff.

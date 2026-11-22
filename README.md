# LendLoop

> **Neighborhood tool-lending board.** A full-stack, type-safe web application where neighbors share tools within their community. Built with Next.js App Router, Clerk authentication, Convex reactive backend, and self-hosted n8n automation.

Convex serves as the single source of truth and enforces all validation, authorization, and business rules. n8n operates purely as a hardened message router and polling coordinator with zero business logic and zero plaintext secrets in code.

---

## 1. Overview & Quick Verification

### Stack Summary

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS | Server-rendered pages, reactive client components, strict CSP |
| **Authentication** | Clerk (Core 3 `@clerk/nextjs`) | Session tokens, passkeys/social login, OIDC sync with Convex |
| **Backend & Database** | Convex 1.50 | Reactive queries & mutations, ACID transactions, HTTP actions, outbox delivery |
| **Automation & Jobs** | Self-hosted n8n (Docker Compose) | Asynchronous webhook delivery, daily overdue polling, Gmail notifications |
| **Testing** | Vitest + `convex-test` | 160 unit, integration, and security tests run against in-memory backend |
| **End-to-End (E2E)** | Playwright + `@clerk/testing` | 13 headless Chromium browser specs across public, auth, admin, and loan lifecycle |
| **Security & Cryptography** | Web Crypto (`crypto.subtle`) + Node `crypto` + n8n Crypto Node | Bidirectional constant-time HMAC-SHA256 signing and verification |

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

```text
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
|  - Domain Modules: users.ts, tools.ts, loans.ts, admin.ts, automation.ts          |
|  - Database: Indexed document store (users, tools, loans, automationEvents)       |
|  - Outbox Scheduler: ctx.scheduler.runAfter (non-blocking webhook delivery)       |
|  - HTTP Router: /overdue-loans, /reminder-result (HMAC-SHA256 verified)           |
+-------------------+-------------------------------------------+-------------------+
                    |                                           ^
       Contract A   | Outbound Webhooks            Contract B   | Inbound Poll (GET)
   x-signature +    | (Async scheduled action)  x-signature +   | Contract C (POST)
   x-timestamp      v                           x-timestamp     |
+---------------------------------------------------------------+-------------------+
|                                 SELF-HOSTED n8n                                   |
|             (Docker Container, N8N_BLOCK_ENV_ACCESS_IN_NODE=true)                 |
|                                                                                   |
|  - Secrets isolated in encrypted n8n Crypto Credentials (zero secrets in Code)    |
|  - Workflow 1: Loan Events Webhook (Code -> Crypto -> timingSafeEqual -> Gmail)   |
|  - Workflow 2: Daily Overdue Reminders (Code -> Crypto -> GET/POST + Gmail)       |
|  - Workflow 3: Global Error Handler (Structured failure alerts, no PII payloads)  |
+----------------------------------------+------------------------------------------+
                                         |
                                         | Gmail OAuth2 Notification
                                         v
                        [ Neighbor / Borrower Mailbox ]
```

### Codebase Layout

```text
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
│   ├── code-nodes/            # Reusable Node.js canonicalization & verification scripts
│   ├── workflows/             # Exported secret-free workflow JSONs (Loan Events, Overdue, Error Handler)
│   ├── docker-compose.yml     # Hardened self-hosted n8n container definition
│   └── README.md              # Detailed workflow import & execution instructions
└── scripts/                   # Developer & security verification tooling
    ├── check-secrets.sh       # Git secret & hygiene scanner
    ├── verify-security.mjs    # Live 8-point HMAC, tamper, cross-route & replay test suite
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
4. **Important:** In Clerk Dashboard under **User & Authentication &rarr; Email, Phone, Username &rarr; Delete user account**, ensure client-side self-deletion is **disabled**. LendLoop enforces privacy-preserving account deletion inside Convex (`deleteMyAccount`) so users cannot delete their profile while holding active loans.

### Step 3: Start Convex Backend
In a dedicated terminal, launch the local Convex development server:

```bash
npx convex dev
```

On first run, this initializes your local/dev Convex deployment and provides `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_SITE_URL`.

Generate a strong 256-bit shared HMAC secret and configure Convex environment variables:

```bash
SECRET=$(openssl rand -hex 32)
echo "Save this for your n8n Crypto Credential: $SECRET"

npx convex env set CLERK_JWT_ISSUER_DOMAIN "[https://your-app.clerk.accounts.dev](https://your-app.clerk.accounts.dev)"
npx convex env set ADMIN_SEED_EMAIL "your-admin-email@example.com"
npx convex env set N8N_WEBHOOK_URL "http://localhost:5678/webhook/lendloop-loan-events"
npx convex env set N8N_WEBHOOK_SECRET "$SECRET"
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
In a third terminal, start self-hosted n8n via Docker Compose (hardened with `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` so JavaScript Code nodes cannot read container environment variables):

```bash
docker compose up -d
```

1. Open `http://localhost:5678` and finish initial local owner setup.
2. Under **Credentials &rarr; Create Credential**, configure:
   - **Crypto:** Set **Hmac Secret** to the exact `$SECRET` configured in `N8N_WEBHOOK_SECRET` in Step 3 (stored encrypted at rest by n8n).
   - **Gmail OAuth2:** Connect your sender mailbox for lifecycle, overdue, and error alert emails.
3. Import all 3 workflow files from `n8n/workflows/` and attach your **Crypto** and **Gmail** credentials to the imported nodes:
   - `error-handler.json` &rarr; Save as `LendLoop Error Handler` *(no need to toggle Active; n8n triggers linked error workflows automatically on production failures)*
   - `request-notification.json` &rarr; Link `LendLoop Error Handler` under **Settings &rarr; Error Workflow**, toggle **Active**
   - `overdue-reminders.json` &rarr; Link `LendLoop Error Handler` under **Settings &rarr; Error Workflow**, toggle **Active**

> **Docker Host Networking Note:** Workflow 2 calls Convex's local HTTP router (`3211`) from inside the n8n container. On Linux, Docker reaches the host via `http://172.17.0.1:3211`; on macOS/Windows (Docker Desktop), update the Workflow 2 HTTP Request URLs to `http://host.docker.internal:3211` (or point to your deployed `.convex.site` URL).

### Step 6: Run Full Verification Gates

```bash
# 1. Typecheck (zero TS errors)
npm run typecheck

# 2. Unit, integration & security test suite (160 tests passing)
npm test

# 3. Playwright E2E browser tests (13 specs passing)
npm run test:e2e

# 4. Git secret & hygiene scanner
bash scripts/check-secrets.sh

# 5. Live 8-point HMAC, tamper, cross-route & replay-window verification (Convex + active n8n)
node scripts/verify-security.mjs
```

---

### Environment Variables & Credentials Reference

| Variable / Credential | Scope | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | **Yes** | Client WebSocket/HTTP URL for Convex (e.g. `http://127.0.0.1:3210`) |
| `CONVEX_SITE_URL` | `.env.local` | **Yes** | Base URL for Convex HTTP router actions (e.g. `http://127.0.0.1:3211`) |
| `ADMIN_SEED_EMAIL` | Convex Env | **Yes** | Email address automatically promoted to `role: "admin"` upon initial sign-in |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | **Yes** | Clerk frontend client key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | `.env.local` | **Yes** | Clerk backend secret key (`sk_test_...`) |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex Env | **Yes** | Issuer domain used to validate OIDC JWTs in `auth.config.ts` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `.env.local` | Optional | Set to `/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `.env.local` | Optional | Set to `/login` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `.env.local` | Optional | Set to `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `.env.local` | Optional | Set to `/dashboard` |
| `N8N_WEBHOOK_URL` | Convex Env | **Yes** | Outbound endpoint called by Convex on loan lifecycle events |
| `N8N_WEBHOOK_SECRET` | Convex Env | **Yes** | Shared 256-bit hex secret for bidirectional HMAC-SHA256 signing & verification |
| `Crypto` Credential (`Hmac Secret`) | n8n Credential Vault | **Yes** | Encrypted copy of `N8N_WEBHOOK_SECRET` used exclusively by built-in n8n Crypto nodes |
| `Gmail OAuth2` Credential | n8n Credential Vault | **Yes** | Sender account used by n8n notification and error handler workflows |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` | `docker-compose.yml` | **Yes** | Prevents n8n Code nodes from reading container environment variables |
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
- **Synchronous Validation & Explicit Recipient Routing:** The Workflow 1 Webhook node is configured with **Respond: When Last Node Finishes**, so invalid or replayed requests fail synchronously rather than acknowledging `HTTP 200` upfront. Validated events route explicitly by role: `requested` and `cancelled` notify the **tool owner** (`ownerEmail`), while `approved`, `declined`, and `returned` notify the **borrower** (`borrowerEmail`).
- **Convex Retries:** If n8n returns a transient error (`5xx`, `408`, `429`, or network failure), Convex automatically retries up to 5 times with exponential backoff (`30s`, `2m`, `10m`, `1h`, `6h`). Non-retryable errors (`400`, `401`) immediately transition the event to `failed` without wasted retries.

### 2. Inbound Overdue Loan Polling (Contract B & C)
- **Contract B (`GET /overdue-loans`):** n8n triggers a daily schedule cron that builds the canonical signing string in a secret-free Code node, computes the HMAC-SHA256 digest in a built-in **Crypto** node, and requests overdue loans from Convex. Overdue loans are calculated at query time (`status === "approved" && endDate < today && returnedAt === undefined`).
- **Contract C (`POST /reminder-result`):** For each processed borrower, n8n builds a raw JSON body containing a deterministic UTC date key (`idempotencyKey: "${loanId}:${YYYY-MM-DD}"`), signs it via the **Crypto** node, and posts back to Convex.
- **Convex Idempotency:** The `automation.recordReminder` mutation uses `by_idempotencyKey` to guarantee that retries or duplicate sweeps within the same day are recorded once without spamming borrowers.

### 3. Failure Isolation & Global Error Workflow
- **Structured, PII-Free Error Alerts:** `n8n/workflows/error-handler.json` acts as the linked Error Workflow for Workflows 1 and 2. On any unhandled production failure, it alerts the operator with workflow name, failed node, error message, and execution URL—without dumping raw user emails or request bodies.
- **Fail-Closed Signatures:** Inbound requests with missing headers, malformed hex digests, expired timestamps (`|now - ts| > 300s`), method/path mismatches, or tampered bodies are rejected before reaching downstream actions. Convex responds with HTTP `401` `{ "error": "unauthorized" }` without leaking stack traces or cryptographic internals.

---

## 5. Security & Data-Minimization Decisions

Security and privacy are designed directly into the architecture:

### Security Controls
1. **DB-Backed Session Validation (`requireActiveUser` & `SessionGuard`):**
   Stateless JWTs suffer from a revocation window if an account is suspended or deleted. LendLoop pairs every authenticated mutation with a DB-backed status check (`requireActiveUser`). On the client, `SessionGuard` reactively monitors user status and immediately signs out suspended/deactivated users, routing them to `/login?reason=suspended`.
2. **Broken Object/Function Level Authorization (BOLA / BFLA) Defense:**
   - There is no public `loans.get(loanId)`. All loan reads (`getParticipantLoan`) enforce that the caller is strictly either the borrower or the tool owner.
   - All state transitions (`approve`, `decline`, `markReturned`) verify owner identity; cancellation verifies borrower identity; approvals atomically reject overlapping date ranges for the same tool.
   - Admin functions (`admin.ts`) enforce `requireAdmin`, reading the verified role directly from the `users` table (never from client claims or arguments) and blocking admins from demoting or suspending themselves.
3. **Zero Plaintext Secrets in Automation (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true` + Crypto Vault):**
   Container environment access is blocked inside n8n JavaScript nodes so workflow editors or compromised snippets cannot exfiltrate container secrets. All HMAC signing and verification uses a `Code (canonical string) -> Crypto (encrypted credential) -> HTTP Request / timingSafeEqual` pipeline, keeping exported workflow JSONs completely free of secret material.
4. **Bidirectional Constant-Time HMAC-SHA256 & Replay Protection:**
   Outbound webhooks and inbound API routes sign `${timestamp}.${method}.${path}.${rawBody}` using `crypto.subtle` in Convex and n8n's Crypto node paired with `crypto.timingSafeEqual` in Node.js, preventing timing side-channels, body tampering, and cross-endpoint signature reuse. A strict **±300-second replay window** rejects stale requests. Verified end-to-end by `node scripts/verify-security.mjs` (8/8 checks passing).
5. **Rate Limiting & Input Sanitization:**
   - Tool creation and loan requests are rate-limited to 15 actions per user per hour via indexed database counters.
   - Tool IDs and Loan IDs are validated using `ctx.db.normalizeId`.
   - String inputs are trimmed and bounded (names &le; 80 chars, descriptions &le; 500 chars).
6. **Hardened HTTP Headers & CSP:**
   `next.config.js` and `proxy.ts` configure strict Content Security Policy (restricting scripts to Clerk and connections to Convex), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `poweredByHeader: false`.

### Data Minimization Controls
1. **Minimal Webhook Payloads:**
   Outbound n8n payloads contain only the exact fields necessary to route and render the notification email (`loanId`, `toolName`, `startDate`, `endDate`, participant names/emails). Internal auth tokens, Clerk identifiers, role levels, and unrelated user records are omitted.
2. **Least-Privilege Query Projections:**
   The public catalog (`tools.ts:listPublic`) strips owner email addresses and internal listing timestamps. Only public tool metadata and owner display names are returned to browsers.
3. **Privacy-Preserving Account Deletion:**
   When a user deletes their account (`users.ts:deleteMyAccount`), deletion is blocked if they have active or unreturned loans. Once settled, all personal data is scrubbed: `name` becomes `"Deleted User"`, and `email` is scrambled to `deleted+<id>@neighborhood.local`. Historical loan ledgers remain intact without retaining personal data, and the user can cleanly re-register later.
4. **Zero-Secret Repository Hygiene:**
   All exported n8n workflow JSON files contain zero live credentials. `scripts/check-secrets.sh` verifies that no `.env` files are tracked and `.env.example` contains zero populated secrets.

---

## 6. What I Would Change for Production

For a high-volume production deployment, I would implement the following architectural enhancements:

1. **n8n Network Isolation, Raw-Byte HMAC & Clean `401` Webhook Responses:**
   Place n8n behind a TLS-terminating reverse proxy (HTTPS + HSTS), restrict the n8n editor UI behind VPN/SSO, and expose only `/webhook/*` through a WAF and rate limiter. Verify inbound signatures against raw HTTP request bytes rather than re-serialized `JSON.stringify(body)` to eliminate whitespace/key-ordering fragility, and route invalid signatures through an `IF -> Respond to Webhook (401)` branch so unauthenticated internet scanners return clean `401`s without flooding the Error Handler with false alerts.
2. **Queue-Backed n8n & Transactional Outbox / DLQ:**
   Run n8n in queue mode (PostgreSQL + Redis) and complement Convex's outbox with a dedicated dead-letter queue (DLQ) supporting manual inspection and replay for permanently failed webhook deliveries.
3. **Dedicated Transactional Email Service:**
   Replace personal Gmail OAuth2 nodes with a dedicated transactional email provider (such as Resend, Postmark, or AWS SES) configured with verified custom domain authentication (SPF, DKIM, DMARC), bounce tracking, and delivery webhooks.
4. **Managed Cloud Infrastructure & Custom Domain Auth:**
   Deploy Next.js on Vercel and the backend on Convex Cloud (`npx convex deploy`). Migrate Clerk to a production instance with custom domain cookies (`auth.lendloop.org`), enterprise SSO, and Cloudflare Turnstile bot protection.
5. **Edge Rate Limiting & Web Application Firewall (WAF):**
   Complement Convex's database rate limits with edge-level rate limiting (Upstash Redis in middleware or Cloudflare WAF rules) to drop volumetric abuse before it reaches application or database workers.
6. **Centralized Observability & Distributed Tracing:**
   Instrument Next.js, Convex, and n8n with OpenTelemetry and Sentry, propagating a `traceparent` correlation ID across the entire lifecycle (HTTP request &rarr; Convex mutation &rarr; webhook payload &rarr; n8n execution &rarr; email dispatch) instead of relying solely on email error alerts.
7. **Managed Secrets & Zero-Downtime Dual-Key Rotation:**
   Manage `N8N_WEBHOOK_SECRET` and `N8N_ENCRYPTION_KEY` in AWS Secrets Manager or HashiCorp Vault, upgrading HMAC verification to accept primary and secondary keys (`PRIMARY` + `SECONDARY`) during rotation windows.
8. **Timezone-Aware Scheduling:**
   Store user IANA timezones (`Intl.DateTimeFormat`) so overdue evaluations and reminder emails trigger relative to each neighbor's local morning (e.g. 09:00 AM local time) rather than a uniform UTC cutoff.
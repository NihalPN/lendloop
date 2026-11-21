# LendLoop n8n Automation Workflows

This directory contains the self-hosted n8n automation workflows and supporting code nodes that handle asynchronous email notifications and scheduled overdue loan processing for LendLoop.

As defined in [`docs/CONTRACTS.md`](../docs/CONTRACTS.md) and [`docs/SPEC.md`](../docs/SPEC.md), **Convex is the single source of truth** and enforces all business logic, authorization, and validation. n8n acts purely as a message router and scheduled polling coordinator with zero business rules.

---

## Architecture & Integration Contracts

| Contract | Direction | Trigger | Endpoint / Transport | Authentication |
|---|---|---|---|---|
| **Contract A** | Convex &rarr; n8n | Loan created, approved, declined, cancelled, returned | `POST /webhook/lendloop-loan-events` | HMAC-SHA256 (`N8N_WEBHOOK_SECRET`) |
| **Contract B** | n8n &rarr; Convex | Daily scheduled cron (e.g. 08:00 UTC) | `GET /overdue-loans?limit=100` | HMAC-SHA256 (`N8N_API_SECRET`) |
| **Contract C** | n8n &rarr; Convex | Post-delivery confirmation write-back | `POST /reminder-result` | HMAC-SHA256 (`N8N_API_SECRET`) |

### HMAC Security Specification
Every request in both directions is cryptographically verified using HMAC-SHA256:
- **Canonical string format:** `{timestamp}.{METHOD}.{path}.{rawBody}`
- **Headers:** `X-LL-Timestamp` (Unix epoch seconds) and `X-LL-Signature` (lowercase hex digest)
- **Replay protection window:** `|now - timestamp| <= 300` seconds
- **Constant-time comparison:** Prevents timing side-channel attacks (`crypto.timingSafeEqual` in Node.js, `constantTimeEqualHex` in Convex)

---

## Directory Structure

```
n8n/
├── README.md                          # This documentation file
├── code-nodes/
│   ├── sign-request.js                # Reusable Node.js HMAC signer for Contracts B & C
│   └── verify-signature.js            # Reusable Node.js HMAC verifier for Contract A
└── workflows/
    ├── error-handler.json             # Global error handler (strips PII, alerts failures)
    ├── overdue-reminders.json         # Daily cron: poll overdue loans, email, write-back
    └── request-notification.json      # Inbound webhook: verifies HMAC, routes loan events
```

---

## Local Setup with Docker Compose

### 1. Start n8n
From the repository root, start the container:

```bash
docker compose up -d
```

The container starts with:
- **Port:** `http://localhost:5678`
- **Volume:** `n8n_data` mounted to `/home/node/.n8n`
- **Crypto Access:** `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (allows Code nodes to compute HMAC-SHA256)
- **Networking:** `extra_hosts: ["host.docker.internal:host-gateway"]` allows n8n inside Docker to reach the local Convex dev server running on host port `3211` (`http://host.docker.internal:3211`)

### 2. Initial n8n Configuration
1. Open `http://localhost:5678` in your browser.
2. Complete the initial owner account setup on first launch.
3. In n8n **Settings &rarr; Variables** (or via container environment in `docker-compose.yml`), configure:
   - `LENDLOOP_WEBHOOK_SECRET` (matches `N8N_WEBHOOK_SECRET` in Convex)
   - `LENDLOOP_API_SECRET` (matches `N8N_API_SECRET` in Convex)
   - `CONVEX_SITE_URL` (defaults to `http://host.docker.internal:3211` in local dev)

### 3. Import Workflows
In the n8n UI:
1. Click **Add workflow &rarr; ... &rarr; Import from file**.
2. Import `n8n/workflows/error-handler.json`. Name it `LendLoop Error Handler` and activate it.
3. Import `n8n/workflows/request-notification.json`. Name it `LendLoop Loan Events`. Ensure its settings select `LendLoop Error Handler` under **Error Workflow**, then activate it.
4. Import `n8n/workflows/overdue-reminders.json`. Name it `LendLoop Overdue Reminders`. Link the error workflow and activate it.

---

## Verifying Webhook & API Signatures Locally

### 1. Test Inbound Webhook Locally (without Docker)
You can test Convex's webhook delivery directly against the mock receiver script:

```bash
# In terminal 1: start the mock receiver
node scripts/mock-receiver.ts

# In terminal 2: trigger a loan mutation in the app
# The mock receiver validates the HMAC signature and logs the received payload
```

### 2. Test Outbound Convex HTTP Actions with CLI Signer
Generate signed curl commands for testing Convex endpoints:

```bash
# Test GET /overdue-loans (Contract B)
node scripts/sign.ts GET /overdue-loans?limit=100

# Test POST /reminder-result (Contract C)
node scripts/sign.ts POST /reminder-result '{"contractVersion":"v1","idempotencyKey":"test:2026-11-22","loanId":"test_id","status":"sent","channel":"email","sentAt":"2026-11-22T00:00:00Z","error":null}'
```

---

## Data Minimization & Privacy Rules

- **Zero PII in Error Workflows:** `error-handler.json` captures only workflow name, execution ID, failed node name, and sanitized error messages. No request payloads, user emails, or tokens are ever forwarded to error channels.
- **Contract Payloads:** Webhook events carry only the minimal subset of fields required to render user emails (`loanId`, `toolName`, `startDate`, `endDate`, `recipient`).
- **Scrubbed Exports:** All exported workflow JSON files in this directory are scrubbed of private email addresses, live webhook tokens, and hardcoded credentials.

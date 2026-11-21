# CONTRACTS.md
 
Integration contracts between **Convex** (source of truth) and **n8n** (automation).
Both sides are built and tested independently against this document. If a contract changes, change this file first, then the code.
 
Contract version: `v1`
 
---
 
## 1. Conventions
 
| Item | Rule |
|---|---|
| Format | JSON, UTF-8, `Content-Type: application/json` |
| Dates | `YYYY-MM-DD` (UTC) for loan dates; ISO 8601 UTC (`2026-11-14T09:30:00Z`) for timestamps |
| IDs | Convex document IDs as opaque strings |
| Unknown fields | Receivers ignore unknown fields (forward compatible) |
| Data minimization | Payloads carry only the fields the receiver needs. No tool descriptions, no unrelated user data |
 
---
 
## 2. Authentication (both directions)
 
Every request in both directions is signed with HMAC-SHA256. Use **two separate secrets**, one per direction, so a leak of one does not compromise the other.
 
| Direction | Secret | Convex env var | n8n credential |
|---|---|---|---|
| Convex -> n8n | `OUTBOUND_WEBHOOK_SECRET` | `N8N_WEBHOOK_SECRET` | `lendloop-webhook-secret` |
| n8n -> Convex | `INBOUND_API_SECRET` | `N8N_API_SECRET` | `lendloop-api-secret` |
 
### Headers
 
| Header | Value |
|---|---|
| `X-LL-Timestamp` | Unix time in seconds, as a string |
| `X-LL-Signature` | Lowercase hex HMAC-SHA256 of the canonical string (below) |
| `X-LL-Event-Id` | (Convex -> n8n only) same as `eventId` in the body, for logging |
 
### Canonical string
 
```
{timestamp}.{METHOD}.{path}.{rawBody}
```
 
- `timestamp`: exactly the `X-LL-Timestamp` value
- `METHOD`: uppercase HTTP method (`POST`, `GET`)
- `path`: request path including query string, e.g. `/overdue-loans?limit=100`. For webhooks, the path portion of the n8n webhook URL (e.g. `/webhook/lendloop-loan-events`)
- `rawBody`: the exact bytes of the body as sent. Empty string for `GET`
```
signature = hex( HMAC_SHA256( secret, canonicalString ) )
```
 
### Verification rules (receiver)
 
1. Reject with `401` if either header is missing.
2. Reject with `401` if `|now - timestamp| > 300` seconds (replay window).
3. Recompute the signature over the **raw** body (never over re-serialized JSON).
4. Compare with a **constant-time** comparison.
5. Only after the signature passes, parse the JSON.
6. Never log secrets or full signatures. Log `eventId` and the verification result only.
Failure responses never reveal which check failed:
 
```json
{ "error": "unauthorized" }
```
 
---
 
## 3. Contract A: Convex -> n8n (loan event webhook)
 
**Endpoint:** `POST {N8N_WEBHOOK_URL}` (n8n Webhook node, path `lendloop-loan-events`)
**Trigger:** any loan creation or status change. Written to the `automationEvents` outbox in the same transaction as the loan change, then delivered by the `automation.deliver` action.
 
### Event types
 
| `type` | Fired when | Recipient |
|---|---|---|
| `loan.requested` | Borrower creates a request | Tool owner |
| `loan.approved` | Owner approves | Borrower |
| `loan.declined` | Owner declines | Borrower |
| `loan.cancelled` | Borrower cancels a pending request | Tool owner |
| `loan.returned` | Owner marks the loan returned | Borrower |
 
### Request body
 
```json
{
  "contractVersion": "v1",
  "eventId": "evt_k17abc123",
  "type": "loan.requested",
  "occurredAt": "2026-11-14T09:30:00Z",
  "loan": {
    "loanId": "jd7xyz456",
    "toolName": "Cordless Drill",
    "status": "pending",
    "startDate": "2026-11-20",
    "endDate": "2026-11-22"
  },
  "recipient": {
    "email": "owner@example.com",
    "name": "Asha",
    "role": "owner"
  }
}
```
 
### Field rules
 
| Field | Type | Notes |
|---|---|---|
| `contractVersion` | string | Always `"v1"` |
| `eventId` | string | Unique per event. **Dedupe key** for n8n. Stable across retries |
| `type` | enum | One of the event types above |
| `occurredAt` | ISO timestamp | When the loan change happened (not the delivery time) |
| `loan.status` | enum | `pending` `approved` `declined` `cancelled` `returned` |
| `recipient.role` | enum | `owner` or `borrower` |
 
**Deliberately excluded:** tool description, condition, other party's email or name, user IDs, Clerk IDs, roles.
 
### Responses (n8n -> Convex)
 
| Status | Body | Meaning | Convex action |
|---|---|---|---|
| `200` | `{ "received": true }` | Accepted and processed | Mark event `sent` |
| `200` | `{ "received": true, "duplicate": true }` | `eventId` already processed | Mark event `sent` |
| `400` | `{ "error": "invalid_payload" }` | Body failed schema validation | Mark `failed`, **no retry** |
| `401` | `{ "error": "unauthorized" }` | Signature or timestamp bad | Mark `failed`, **no retry**, alert |
| `408`, `429`, `5xx`, network error | any | Transient | **Retry** with backoff |
 
### Retry policy (Convex side)
 
- Max **5 attempts**
- Delays after each failure: `30s, 2m, 10m, 1h, 6h` (with small random jitter)
- Same `eventId` and same body on every retry. The timestamp and signature are regenerated on each attempt
- After the last failure: `status = "failed"`, `lastError` stored, visible to admins
### n8n processing rules
 
1. Verify the signature (Section 2).
2. Validate the payload shape. Reject with `400` if required fields are missing.
3. Dedupe on `eventId` (n8n static data or a data store). Return the duplicate `200` if seen.
4. Send the notification using only the fields in the body (email, Slack, Discord, or a logged mock).
5. Respond `200` only **after** the notification step succeeds.
6. Any unhandled failure triggers the Error Workflow (Section 6).
---
 
## 4. Contract B: n8n -> Convex (overdue loans)
 
**Endpoint:** `GET {CONVEX_SITE_URL}/overdue-loans?limit=100&cursor=<opaque>`
**Caller:** n8n daily Schedule Trigger.
**Body:** none (signature computed with an empty `rawBody`).
 
### Definition of overdue
 
A loan is overdue when `status == "approved"` and `endDate < today (UTC)` and `returnedAt` is unset. It is derived at query time, never stored.
 
### Response `200`
 
```json
{
  "contractVersion": "v1",
  "asOf": "2026-11-14",
  "loans": [
    {
      "loanId": "jd7xyz456",
      "toolName": "Cordless Drill",
      "dueDate": "2026-11-12",
      "daysOverdue": 2,
      "borrower": {
        "email": "borrower@example.com",
        "name": "Ravi"
      }
    }
  ],
  "nextCursor": null
}
```
 
| Field | Notes |
|---|---|
| `limit` | 1-100, default 100 |
| `nextCursor` | `null` when there are no more pages. Otherwise pass it back as `cursor` |
| Excluded | Owner details, tool description, user IDs |
 
### Errors
 
| Status | Body | Meaning |
|---|---|---|
| `401` | `{ "error": "unauthorized" }` | Bad signature or timestamp |
| `400` | `{ "error": "invalid_query" }` | Bad `limit` or `cursor` |
| `5xx` | `{ "error": "server_error" }` | n8n retries (Section 6) |
 
---
 
## 5. Contract C: n8n -> Convex (reminder result write-back)
 
**Endpoint:** `POST {CONVEX_SITE_URL}/reminder-result`
**Caller:** n8n, once per loan after attempting the reminder.
 
### Request body
 
```json
{
  "contractVersion": "v1",
  "idempotencyKey": "jd7xyz456:2026-11-14",
  "loanId": "jd7xyz456",
  "status": "sent",
  "channel": "email",
  "sentAt": "2026-11-14T06:00:12Z",
  "error": null
}
```
 
| Field | Type | Rules |
|---|---|---|
| `idempotencyKey` | string | Exactly `{loanId}:{YYYY-MM-DD}` where the date is the run date (UTC). One reminder per loan per day |
| `loanId` | string | Must match the key prefix |
| `status` | enum | `sent` or `failed` |
| `channel` | string | `email`, `slack`, `discord`, `mock` (max 20 chars) |
| `sentAt` | ISO timestamp | When n8n attempted the send |
| `error` | string or null | Required when `status = "failed"`. Max 500 chars, no PII |
 
### Idempotency rules
 
- `idempotencyKey` has a **unique index** in `automationEvents`.
- First time: create the record, respond `200 { "recorded": true }`.
- Same key again (retry): **do not** create a second record. Respond `200 { "recorded": true, "duplicate": true }`.
- Same key with a different `status` (e.g. earlier `failed`, now `sent`): update the existing record to `sent`. Never downgrade `sent` to `failed`.
### Errors
 
| Status | Body | Meaning | n8n action |
|---|---|---|---|
| `400` | `{ "error": "invalid_payload" }` | Schema failure or key/loanId mismatch | Do not retry, error workflow |
| `401` | `{ "error": "unauthorized" }` | Bad signature or timestamp | Do not retry, error workflow |
| `404` | `{ "error": "loan_not_found" }` | Unknown `loanId` | Do not retry, error workflow |
| `5xx` | `{ "error": "server_error" }` | Transient | Retry |
 
---
 
## 6. Failure handling
 
### n8n retries
 
| Node | Retry on fail | Max tries | Wait |
|---|---|---|---|
| HTTP Request to Convex | on | 3 | 5s, then exponential |
| Notification send | on | 3 | 5s |
 
Do **not** retry on `400`, `401`, `404`.
 
### Error Workflow (n8n)
 
Both workflows attach the same Error Workflow (Error Trigger node). Failed runs are never silent.
 
Error Workflow output (to Slack, email, or logged mock):
 
```json
{
  "workflow": "overdue-reminders",
  "executionId": "12345",
  "failedNode": "POST reminder-result",
  "message": "Request failed with status 401",
  "occurredAt": "2026-11-14T06:00:30Z"
}
```
 
Never include request bodies, emails or secrets in error alerts.
 
### Convex-side visibility
 
- `automationEvents.status = "failed"` rows are queryable by admins.
- Each row stores `attempts`, `lastError`, `createdAt`, `updatedAt`.
---
 
## 7. Environment variables
 
### Convex
 
| Name | Purpose |
|---|---|
| `N8N_WEBHOOK_URL` | Full URL of the n8n webhook |
| `N8N_WEBHOOK_SECRET` | Signs outbound webhooks (Contract A) |
| `N8N_API_SECRET` | Verifies inbound requests (Contracts B, C) |
| `ADMIN_SEED_EMAIL` | Email promoted to `admin` on first login |
 
### n8n
 
| Name | Purpose |
|---|---|
| `LENDLOOP_WEBHOOK_SECRET` | Verifies Convex webhooks (same value as `N8N_WEBHOOK_SECRET`) |
| `LENDLOOP_API_SECRET` | Signs requests to Convex (same value as `N8N_API_SECRET`) |
| `CONVEX_SITE_URL` | Base URL for the HTTP endpoints |
| `NODE_FUNCTION_ALLOW_BUILTIN` | Set to `crypto` so Code nodes can compute HMAC |
 
Secrets live only in environment variables or n8n credentials. They never appear in code, in `.env.example` values, or in exported workflow JSON.
 
---
 
## 8. Test matrix
 
Each row is a required test, run standalone against the receiver.
 
| # | Contract | Case | Expected |
|---|---|---|---|
| 1 | A | Valid signed event | `200 received` |
| 2 | A | Same `eventId` again | `200 duplicate` |
| 3 | A | Tampered body | `401` |
| 4 | A | Wrong secret | `401` |
| 5 | A | Timestamp older than 300s | `401` |
| 6 | A | Missing `loan.status` | `400` |
| 7 | A | n8n down, Convex retries | Backoff, then `failed` after 5 |
| 8 | B | Valid signed GET | `200` with overdue list |
| 9 | B | Unsigned GET | `401` |
| 10 | B | Returned or not-yet-due loan | Not in list |
| 11 | C | Valid write-back | `200 recorded` |
| 12 | C | Same key twice | One record, second returns `duplicate` |
| 13 | C | Key does not match `loanId` | `400` |
| 14 | C | Unknown `loanId` | `404` |
| 15 | C | `failed` then `sent` for same key | Record becomes `sent` |
| 16 | C | `sent` then `failed` for same key | Stays `sent` |
| 17 | All | Secret appears in logs or exported JSON | Never (grep check) |
 
---
 
## 9. Changing a contract
 
1. Update this file and bump `contractVersion` if the change is breaking.
2. Update the test matrix.
3. Update the receiver first, then the sender.
4. Add a short ADR in `docs/adr/`.
 
# SPEC.md

LendLoop backend specification. Source of truth for the data model and business rules. `CONTRACTS.md` covers the n8n integration. If a rule changes, change this file first, then the tests, then the code.

---

## 1. Principles

- Convex is the only place rules are enforced. The UI is never trusted.
- Identity and role come from `ctx.auth` and the `users` table, never from function arguments.
- Every public function returns explicit field projections, never raw documents.
- Dates are `YYYY-MM-DD` strings in UTC. Timestamps are epoch milliseconds (`number`).

---

## 2. Data model

### users
| Field | Type | Notes |
|---|---|---|
| `clerkId` | string | `identity.subject` from Clerk |
| `email` | string | from the verified Clerk identity |
| `name` | string | from the Clerk identity, fallback to email prefix |
| `role` | `"admin"` or `"user"` | default `"user"` |
| `trustedLender` | boolean | default `false`, set only by an admin |

Index: `by_clerkId` on `clerkId`.
Index: `by_email` on `email`.

### tools
| Field | Type | Notes |
|---|---|---|
| `ownerId` | Id<users> | set from the caller, never from args |
| `name` | string | 1 to 80 chars, trimmed |
| `category` | enum | `power_tools`, `garden`, `kitchen`, `camping`, `cleaning`, `other` |
| `condition` | enum | `new`, `good`, `fair`, `worn` |
| `description` | string | 0 to 500 chars |
| `status` | `"listed"` or `"removed"` | removal is a soft delete |

Index: `by_owner_status` on `ownerId`, `status`.
Index: `by_status_category` on `status`, `category`.

### loans
| Field | Type | Notes |
|---|---|---|
| `toolId` | Id<tools> | |
| `borrowerId` | Id<users> | set from the caller |
| `ownerId` | Id<users> | copied from the tool at request time (denormalized for indexes and authz) |
| `startDate` | string | `YYYY-MM-DD` |
| `endDate` | string | `YYYY-MM-DD`, inclusive |
| `status` | enum | `pending`, `approved`, `declined`, `cancelled`, `returned` |
| `returnedAt` | number, optional | set when marked returned |

Index: `by_tool` on `toolId`.
Index: `by_borrower` on `borrowerId`.
Index: `by_owner` on `ownerId`.
Index: `by_owner_status` on `ownerId`, `status`.
Index: `by_status_endDate` on `status`, `endDate` (for overdue queries).

### automationEvents
| Field | Type | Notes |
|---|---|---|
| `loanId` | Id<loans> | |
| `type` | enum | `loan.requested`, `loan.approved`, `loan.declined`, `loan.cancelled`, `loan.returned`, `overdue_reminder` |
| `idempotencyKey` | string | `eventId` for loan events, `{loanId}:{YYYY-MM-DD}` for reminders |
| `status` | enum | `queued`, `sent`, `failed` |
| `attempts` | number | starts at 0 |
| `lastError` | string, optional | max 500 chars, no PII |
| `createdAt` | number | |
| `updatedAt` | number | |

Index: `by_loan` on `loanId`.
Index: `by_idempotencyKey` on `idempotencyKey`.
Index: `by_status` on `status`.

Convex does not enforce unique indexes. Uniqueness of `idempotencyKey` is enforced inside the mutation by querying `by_idempotencyKey` first. This is safe because mutations are transactional.

### Derived values (never stored)
- **Overdue:** `status = "approved"` and `endDate < today (UTC)` and `returnedAt` unset.
- **Tool available:** `status = "listed"` and there is no loan for it with `status = "approved"`, `returnedAt` unset, and `startDate <= today`. A tool whose approved loan is overdue stays unavailable until it is returned.

---

## 3. Validation limits

| Item | Rule |
|---|---|
| Tool name | 1 to 80 chars after trimming |
| Description | max 500 chars |
| Category, condition | must be one of the enums above |
| Dates | match `^\d{4}-\d{2}-\d{2}$` and be real calendar dates |
| Loan range | `startDate <= endDate`, `startDate >= today`, length at most 30 days inclusive: `(endDate - startDate) + 1 <= 30` |

---

## 4. Rules

### Identity and users
- **R1** Every authenticated function derives the user from `ctx.auth`. No function accepts `userId`, `ownerId`, `borrowerId` or `role` as an argument. Admin actions may take a target `userId`, always after `requireAdmin`.
- **R2** Role is read only from the `users` table. It is never taken from the client.
- **R3** `ensureUser` is idempotent. Calling it twice creates one row. It creates the user on first call with `role = "user"`, unless the verified identity email equals `ADMIN_SEED_EMAIL`, in which case `role = "admin"`. The seed applies only at creation and never changes an existing user.

### Tools
- **R4** A user can create tools. The owner is always the caller.
- **R5** A user can update or remove only their own tools. An admin can remove any tool. Only the owner can update (an admin cannot edit another user's content).
- **R6** `tools.listPublic` needs no login and returns, for tools with `status = "listed"`, exactly `{ name, category, available }`. No ids, no owner data, no description, no condition.
- **R7** Name, category, condition and description are validated per Section 3.
- **R8** `tools.listAll` (authenticated) returns listed tools with availability, filterable by category. It never returns owner email.
- **R9** A tool with an approved, unreturned loan cannot be removed (by owner or admin). Pending loans on a removed tool become `cancelled` (deferred to the outbox slice).

### Loans
- **R10** A user cannot request their own tool.
- **R11** A loan can only be requested for a tool with `status = "listed"`.
- **R12** Loan dates are validated per Section 3.
- **R13** Only the tool owner can approve or decline a pending loan.
- **R14** Only the borrower can cancel their own pending loan.
- **R15** Only the tool owner can mark an approved loan as returned.
- **R16** Status changes follow the transition table in Section 5. Anything else is rejected.
- **R17** Approving a loan fails if another approved, unreturned loan for the same tool overlaps the date range. Overlap means `a.startDate <= b.endDate` and `b.startDate <= a.endDate`.
- **R18** A loan is visible to its borrower, its owner, and admins. Nobody else can read it.
- **R19** The admin role cannot approve, decline or return loans as an admin. Participant rights apply to admins who are participants (tool owner or borrower); non-participant admins get NOT_FOUND on loan actions and have read access to all loans only.

### Admin
- **R20** `admin.listAllLoans` and `admin.setTrustedLender` require the admin role. `admin.listFailedEvents` is deferred to the outbox slice.
- **R21** `trustedLender` is only a flag shown in the UI. It changes no permissions.
- **R30** `admin.listAllLoans` returns loans newest first (default creation order, no new index), `.take(200)`: `_id`, `toolName`, `ownerId`, `ownerName`, `borrowerId`, `borrowerName`, `startDate`, `endDate`, `status`, `returnedAt` (`number | null`). No emails, no `clerkId`. Admin-only.
- **R31** `admin.setTrustedLender({ userId, trusted })` requires admin, `NOT_FOUND` for an unknown user, patches only `trustedLender`, returns `{ userId, trustedLender }`. An admin may set it on themselves.
- **R32** `toolProjection` gains `ownerTrusted: boolean` (the owner's `trustedLender`). `publicToolProjection` is unchanged: public stays exactly `{ name, category, available }`.

### Automation (details in CONTRACTS.md)
- **R22** A loan change and its `automationEvents` row are written in the same mutation (outbox). Delivery happens afterwards in an action.
- **R23** Outbound payloads contain only the fields defined in CONTRACTS.md.
- **R24** The HMAC signature is verified on every inbound webhook request (n8n -> Convex). The signature is computed over the canonical string `${timestamp}.${METHOD}.${path}.${rawBody}`. The timestamp must be within 300 seconds of server time. The comparison is constant-time.
- **R25** Overdue definition: a loan is overdue when its `status = "approved"`, `returnedAt` is unset (null), and `endDate < today (UTC)`. Reminder write-back is idempotent. The same `idempotencyKey` creates one record. A `sent` record is never downgraded to `failed`.

---

## 5. Loan state machine

| From | To | Who | Extra checks |
|---|---|---|---|
| (new) | `pending` | borrower (not the owner) | R10, R11, R12 |
| `pending` | `approved` | tool owner | R17 no overlap |
| `pending` | `declined` | tool owner | |
| `pending` | `cancelled` | borrower | |
| `approved` | `returned` | tool owner | sets `returnedAt` |

Terminal states: `declined`, `cancelled`, `returned`. All other transitions are rejected.

---

## 6. Errors

Functions throw `ConvexError` with a code and a short, non-sensitive message.

| Code | When |
|---|---|
| `UNAUTHENTICATED` | no valid identity |
| `FORBIDDEN` | wrong role or not the owner/borrower |
| `NOT_FOUND` | missing resource, or one the caller may not see |
| `INVALID_INPUT` | validation failed |
| `INVALID_TRANSITION` | transition not allowed (R16) |
| `CONFLICT_OVERLAP` | date overlap (R17) |
| `CONFLICT` | blocked by current state, e.g. removing a tool with an active loan |
| `INTERNAL_ERROR` | unexpected server state, e.g. a just-inserted row is missing |

---

## 7. Test coverage map

Every rule needs at least one test. Tests assert the rule itself: exact keys, specific error code, wrong user rejected, duplicate key creates one record.

| Module | Rules |
|---|---|
| `users.test.ts` | R1, R2, R3 |
| `tools.test.ts` | R4 to R9, R32 |
| `loans.test.ts` | R10 to R19, R32 |
| `admin.test.ts` | R20, R30, R31 |
| `hmac.test.ts`, `automation.test.ts`, `http.test.ts` | R22 to R25 |



Loans API: request(toolId, startDate, endDate), approve(loanId), decline(loanId), cancel(loanId), markReturned(loanId), listMine (as borrower), listIncoming (as owner). No generic get; admin reads come in the admin slice.
Queries listMine and listIncoming use .order("desc").take(200).

New/clarified rules:
- R26: a borrower can have only one pending request per tool at a time (CONFLICT).
- R27: approve fails with CONFLICT if the tool is no longer listed, and with INVALID_INPUT if endDate < today (expired request).
- R28: authorization and check order:
  - Loan actions: requireUser -> fetch loan -> NOT_FOUND unless the caller is the borrower or the owner (participant rights apply to admins who are participants; non-participant admins get NOT_FOUND) -> role check for the action (FORBIDDEN for a participant doing the wrong action, e.g. borrower approving, owner cancelling, borrower returning) -> transition check (INVALID_TRANSITION) -> action-specific checks: tool listed (CONFLICT) -> expired (INVALID_INPUT) -> overlap (CONFLICT_OVERLAP).
  - Request order: requireUser -> tool fetch -> NOT_FOUND (missing or removed) -> own tool check (FORBIDDEN) -> dates validation (INVALID_INPUT) -> pending duplicate check (CONFLICT).
- R29: loan projection exposes: _id, toolName, startDate, endDate, status, returnedAt (number | null, always present), and counterpartyName (owner name for the borrower, borrower name for the owner). Never email, never clerkId, never user IDs.
- R17 clarified: overlap is by date range only, among approved loans with returnedAt unset. An overdue unreturned loan does not block a later-dated request (the tool shows as unavailable); document as a known limitation.
- Transition table lives in convex/lib/loanStateMachine.ts as pure functions (canTransition(from, action)), unit-tested on its own.
- Outbox hooks (R22) are deferred: leave TODO(R22) at each mutation; no automationEvents yet.
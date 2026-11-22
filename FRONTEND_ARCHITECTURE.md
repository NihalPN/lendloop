# LendLoop: Frontend Architecture & Integration Guide

> **Notice for Backend Integrator (Nematronics)**:
> This document is the absolute specification for the LendLoop frontend. The user interface has been designed, audited, and visually certified under the **"Neighborhood Workshop"** aesthetic using `impeccable` design principles.
>
> **CRITICAL RULE**: Do **NOT** modify or redesign the layout structure, typography, borders, or color tokens. When connecting Convex queries and mutations or Clerk user authentication, adapt your backend payloads to fit the existing component props and interfaces defined herein.

---

## 1. Design System & Constraints ("Neighborhood Workshop")

The aesthetic represents a tactile, high-density neighborhood tool shed noticeboard. It rejects generic modern SaaS trends in favor of a timeless, printed-document feel.

### Color Tokens
| Token | Hex Value | Tailwind Class | Purpose |
|---|---|---|---|
| **Canvas Background** | `#F7F5F0` | `bg-[#F7F5F0]` | Primary background across all pages |
| **Surface / Cards** | `#FFFFFF` | `bg-white` | Information cards, tables, modal surfaces |
| **Structural Borders** | `#E2DDD5` | `border-[#E2DDD5]` | 1px dividers, card outlines, table borders |
| **Dense Dividers** | `#E2DDD5/60` | `border-[#E2DDD5]/60` | Internal dividers in compact cards |
| **Primary Ink** | `#1C1917` | `text-[#1C1917]` | Major headlines, primary buttons, active items |
| **Muted Stone** | `#57534E` | `text-[#57534E]` | Secondary labels, descriptions, metadata |
| **Action Accent (Rust)** | `#D95D39` | `bg-[#D95D39]` | High-intent buttons, overdue tool badges/borders |
| **Trust Badge (Pine)** | `#2D6A4F` | `bg-[#2D6A4F]` | Available status, ID Verified neighbor badges |

### Strict Visual Anti-Patterns (BANNED)
1. **NO Drop Shadows**: Do not add `shadow`, `shadow-md`, `shadow-lg`, or filter blur. Surfaces are flat with 1px borders.
2. **NO Gradients or Neon Colors**: Do not use `bg-gradient-to-*` or bright accent colors.
3. **NO Rounded Borders Beyond `sm`**: All cards, inputs, and buttons use `rounded-none`. Only subtle badges sparingly use `rounded-none` or `rounded-sm`. Never use `rounded-md`, `rounded-lg`, or `rounded-full` (except spinner animations).
4. **NO Emojis or Illustrations**: Never inject emoji icons (🚀, 🎉, ✨) or generic SVG illustrations into empty states. Use typographic badges and monospace brackets (e.g. `[ + NEW LISTING ]`, `[ AVAILABLE TODAY ]`).

### Typography Stack
- **Headlines**: `font-serif` ([Newsreader](https://fonts.google.com/specimen/Newsreader)), tight tracking (`tracking-tight`), uppercase or sentence-case.
- **Labels, Badges, Metrics**: `font-mono` ([JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)), uppercase, wide letterspacing (`tracking-widest` or `tracking-wider`), dense scale (`text-[10px]` or `text-xs`).
- **Body & Captions**: `font-sans` ([Inter](https://fonts.google.com/specimen/Inter)), clean line height, high readability (`text-xs` or `text-sm leading-relaxed`).

---

## 2. Route & Component Hierarchy

```
app/
├── layout.tsx                      # Root layout (Google Fonts, ToastProvider, selection colors)
├── globals.css                     # Tailwind v4 theme variables (--font-serif, --font-mono, --font-sans)
├── page.tsx                        # Route: / (Public catalog, privacy-safe cards, hero)
├── how-it-works/
│   └── page.tsx                    # Route: /how-it-works (3-step timeline, community pledge)
├── login/
│   └── page.tsx                    # Route: /login (Mock authentication & demo personas)
├── dashboard/
│   ├── layout.tsx                  # Server Component shell (Sticky header, user welcome)
│   ├── page.tsx                    # Route: /dashboard (Suspense wrapper for DashboardClient)
│   ├── my-listings/
│   │   └── page.tsx                # Route: /dashboard/my-listings (initialTab="listings")
│   ├── my-requests/
│   │   └── page.tsx                # Route: /dashboard/my-requests (initialTab="requests")
│   └── inbox/
│       └── page.tsx                # Route: /dashboard/inbox (initialTab="inbox")
└── admin/
    └── page.tsx                    # Route: /admin (Suspense wrapper for AdminClient)

components/
├── mock-data.ts                    # Hardcoded prototype datasets (MOCK_TOOLS, MOCK_LOANS)
├── ui/
│   ├── Toast.tsx                   # Tactile auto-dismiss notification provider & hook (useToast)
│   ├── StatusBadge.tsx             # Typographic badges (available, pending, late, verified)
│   └── Skeleton.tsx                # Suspense skeleton placeholders (ToolsGridSkeleton, TableSkeleton)
├── dashboard/
│   ├── DashboardClient.tsx         # Client coordinator (Tab navigation, search/filter state, inventory)
│   ├── ToolCard.tsx                # Single tool card with simulated reservation dispatch
│   ├── AddToolForm.tsx             # Controlled form for registering new equipment with 1s delay
│   └── WorkflowTimeline.tsx        # Active loans, overdue alerts (2px rust border), approve/decline
└── admin/
    ├── AdminClient.tsx             # Admin coordinator (Metrics, table selection, drawer sync)
    ├── AdminMetrics.tsx            # 5 KPI cards (Users, Listings, Loans, Overdue, Trusted)
    ├── AdminAuditTable.tsx         # Searchable audit table with override modal
    └── AdminAuditDrawer.tsx        # User audit detail pane (Role switcher, trusted lender toggle)
```

---

## 3. Component Specifications & Data Contracts

When replacing mock state with real Convex queries, map the query results to the exact props below.

### 3.1 Public Tool Cards (`app/page.tsx`)
The unauthenticated public feed must **strictly enforce privacy** (Rules R4 & R8).
- **Allowed Fields**: Tool Name, Category, Availability, Distance.
- **Banned Fields**: Owner Name, Owner Email, Detailed Description, Reservation History.
```typescript
interface PublicToolCardData {
  id: string;
  name: string;
  category: "power_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other";
  available: boolean;
  distance: string; // e.g. "0.2 mi"
}
```
*Convex Source Mapping*: Maps to `api.tools.listPublic` with `publicToolProjectionValidator` (`{ name, category, available }`).

---

### 3.2 ToolCard (`components/dashboard/ToolCard.tsx`)
Used in the authenticated workshop dashboard.
```typescript
export interface Tool {
  id: string;
  name: string;
  category: string;
  condition: "new" | "good" | "fair" | "worn";
  distance: string;
  ownerName: string;
  available: boolean;
  image?: string;
}

interface ToolCardProps {
  tool: Tool;
  onRequestBorrow?: (tool: Tool) => void;
}
```
*Interactions*:
- Clicking `[ REQUEST TO BORROW ]` transitions state to `[ Requesting... ]` (spinner), updates the badge to `[ REQUEST PENDING ]`, locks the button to `✓ Request Sent`, and fires a toast via `useToast()`.
*Convex Source Mapping*: Maps to `api.tools.listAll`. On borrow click, calls `api.loans.request({ toolId, startDate, endDate })`.

---

### 3.3 AddToolForm (`components/dashboard/AddToolForm.tsx`)
Controlled form for contributing a tool to the shed.
```typescript
interface AddToolFormProps {
  onAddTool?: (newTool: Tool) => void;
}
```
*Form Fields*:
- `name: string` (required, trimmed)
- `category: "power_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other"`
- `condition: "new" | "good" | "fair" | "worn"`
- `description: string` (optional usage & return notes)
*Convex Source Mapping*: Calls `api.tools.create({ name, category, condition, description })`.

---

### 3.4 WorkflowTimeline (`components/dashboard/WorkflowTimeline.tsx`)
Tracks active borrowings and incoming lender requests.
```typescript
interface BorrowedItem {
  id: string;
  toolName: string;
  ownerName: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  status: "pending" | "approved" | "returned" | "overdue";
  isOverdue?: boolean;
}

interface IncomingRequest {
  id: string;
  toolName: string;
  category: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "declined";
  note: string;
}
```
*Visual Requirements*:
- Any overdue loan (`isOverdue === true` or `status === "overdue"`) **MUST** render with `border-2 border-[#D95D39]` and the micro-annotation `[ OVERDUE · REMINDER SENT ]`.
- `handleMarkReturned`: Calls `api.loans.markReturned({ loanId })`.
- `handleApprove`: Calls `api.loans.approve({ loanId })`.
- `handleDecline`: Calls `api.loans.decline({ loanId })`.

---

### 3.5 AdminAuditTable & Drawer (`components/admin/`)
Administrative overseer console.
```typescript
export interface LoanRecord {
  id: string;
  toolName: string;
  category: string;
  owner: string;
  borrower: string;
  dates: string;
  status: "late" | "active" | "listed" | "pending" | "returned" | "cancelled";
  statusDetail?: string;
}

export interface AuditUserProfile {
  name: string;
  role: "user" | "admin";
  lent: number;
  borrowed: number;
  late: number;
  trusted: boolean;
  status: "active" | "suspended";
  associatedTool?: string;
  lastAction?: string;
}
```
*Interactions*:
- Clicking any row in `AdminAuditTable` invokes `onSelectLoan(loan)`, which immediately updates `selectedUser` in `AdminAuditDrawer`.
- `AdminAuditDrawer` toggles trusted lender status (`api.users.toggleTrustedLender`) and role assignment.

---

## 4. Toast Notification Contract (`components/ui/Toast.tsx`)

Every mutation or simulated user action communicates feedback through `useToast()`:
```typescript
const { showToast } = useToast();

// Signatures
showToast(title: string, message: string, variant?: "success" | "rust" | "info");
```
- `variant="success"`: Pine green accent border (`#2D6A4F`)
- `variant="rust"`: Rust red accent border (`#D95D39`) for cancellations, overrides, or removals
- `variant="info"`: Dark ink border (`#1C1917`)

---

## 5. Mobile Responsiveness Rules (< 640px)

1. **Header Stacking**:
   - In `app/admin/page.tsx`, buttons must stack vertically with `flex flex-col sm:flex-row items-stretch sm:items-center w-full sm:w-auto`.
   - In `app/page.tsx`, header text displays `[ Sign In ]` on mobile (`< 640px`) and `[ Sign In to Lend or Borrow ]` on desktop.
2. **Hero Buttons**:
   - Primary action buttons in hero/CTA sections must stretch full-width on mobile (`w-full sm:w-auto`).
3. **Footers**:
   - Footer links must use `flex flex-wrap items-center justify-center gap-x-6 gap-y-3` with `whitespace-nowrap` on every link to prevent crowded word wrapping.
4. **Bottom CTA Banner**:
   - Headline typography must use `text-sm sm:text-base font-medium leading-snug` (not uppercase tracking-widest).

---

## 6. How to Connect Backend (Convex + Clerk) Without Breaking the UI

1. **Keep Component Shells**: Retain the existing Server Component files (`app/dashboard/page.tsx`, `app/admin/page.tsx`) with their `<Suspense>` boundaries.
2. **Replace Mock State Hooks**:
   - In `components/dashboard/DashboardClient.tsx`, replace `const [tools, setTools] = useState(MOCK_TOOLS)` with `const tools = useQuery(api.tools.listAll) ?? []`.
   - In `components/dashboard/WorkflowTimeline.tsx`, replace `activeBorrowing` with `useQuery(api.loans.listMine)` and `incomingRequests` with `useQuery(api.loans.listIncoming)`.
   - In `components/admin/AdminClient.tsx`, replace `loans` with `useQuery(api.admin.listAllLoans)` and metrics with `useQuery(api.admin.getPlatformMetrics)`.
3. **Maintain Projection Types**:
   - Map Convex document properties (`_id`, `toolName`, `category`) directly into the component prop fields. Do not alter CSS classes or component layouts.

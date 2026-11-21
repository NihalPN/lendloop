/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { asUser } from "./helpers";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob(["../**/*.ts", "!../tests/**"]);

const PINNED_TIME = new Date("2026-11-15T12:00:00Z").getTime();

describe("loans", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("authentication guards", () => {
    it("rejects unauthenticated calls on all loan endpoints with UNAUTHENTICATED using real IDs", async () => {
      const t = convexTest(schema, modules);

      // Create real rows via t.run
      const { toolId, loanId } = await t.run(async (ctx) => {
        const u1 = await ctx.db.insert("users", {
          clerkId: "clerk_u1",
          tokenIdentifier: "clerk_u1",
          email: "u1@example.com",
          name: "U1",
          role: "user",
          trustedLender: false,
        });
        const u2 = await ctx.db.insert("users", {
          clerkId: "clerk_u2",
          tokenIdentifier: "clerk_u2",
          email: "u2@example.com",
          name: "U2",
          role: "user",
          trustedLender: false,
        });
        const tool = await ctx.db.insert("tools", {
          ownerId: u1,
          name: "Real Tool",
          category: "power_tools",
          condition: "good",
          description: "A tool",
          status: "listed",
        });
        const loan = await ctx.db.insert("loans", {
          toolId: tool,
          ownerId: u1,
          borrowerId: u2,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
          status: "pending",
        });
        return { toolId: tool, loanId: loan };
      });

      await expect(
        t.mutation(api.loans.request, {
          toolId,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      await expect(
        t.mutation(api.loans.approve, { loanId })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      await expect(
        t.mutation(api.loans.decline, { loanId })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      await expect(
        t.mutation(api.loans.cancel, { loanId })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      await expect(
        t.mutation(api.loans.markReturned, { loanId })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      await expect(t.query(api.loans.listMine, {})).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });

      await expect(t.query(api.loans.listIncoming, {})).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });
    });
  });

  describe("loan request creation & request order (R10, R11, R12, R26, R28)", () => {
    it("creates a pending loan when requested with valid dates and returns null returnedAt", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner");
      const { client: borrowerClient, user: borrower } = await asUser(
        t,
        "borrower"
      );

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Lawn Mower",
        category: "garden",
        condition: "good",
        description: "Runs well",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });

      expect(loan.toolName).toBe("Lawn Mower");
      expect(loan.startDate).toBe("2026-11-20");
      expect(loan.endDate).toBe("2026-11-25");
      expect(loan.status).toBe("pending");
      expect(loan.returnedAt).toBeNull();
      expect(loan.counterpartyName).toBe(owner.name);

      const stored = await t.run(async (ctx) =>
        ctx.db.get(loan._id as Id<"loans">)
      );
      expect(stored?.borrowerId).toBe(borrower._id);
      expect(stored?.ownerId).toBe(owner._id);
      expect(stored?.status).toBe("pending");
      expect(stored?.returnedAt).toBeUndefined();
    });

    it("rejects tool owner requesting their own tool with FORBIDDEN and creates no row (R10)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_self");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Lawn Mower",
        category: "garden",
        condition: "good",
        description: "Mine",
      });

      await expect(
        ownerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      const loanCount = await t.run(async (ctx) => {
        const rows = await ctx.db.query("loans").collect();
        return rows.length;
      });
      expect(loanCount).toBe(0);
    });

    it("rejects request on a non-existent or removed tool with NOT_FOUND (R11)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(
        t,
        "owner_removed"
      );
      const { client: borrowerClient } = await asUser(t, "borrower_removed");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Tool To Remove",
        category: "power_tools",
        condition: "new",
        description: "Will be removed",
      });
      await ownerClient.mutation(api.tools.remove, { toolId: tool._id });

      // Removed tool
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      // Real deleted tool ID using owner user's _id
      const deletedToolId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("tools", {
          ownerId: owner._id,
          name: "Temp Tool",
          category: "other",
          condition: "good",
          description: "Temp",
          status: "listed",
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: deletedToolId,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("enforces request order: tool NOT_FOUND -> own tool FORBIDDEN -> dates INVALID_INPUT -> duplicate CONFLICT", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_order");
      const { client: borrowerClient } = await asUser(t, "borrower_order");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Router",
        category: "power_tools",
        condition: "good",
        description: "Router",
      });

      // 1. Removed tool + bad dates -> NOT_FOUND (tool check comes first)
      await ownerClient.mutation(api.tools.remove, { toolId: tool._id });
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-13-01",
          endDate: "2026-13-05",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      // 1b. Owner requesting their own REMOVED tool -> NOT_FOUND (tool check before own-tool check)
      await expect(
        ownerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      // Re-create tool
      const tool2 = await ownerClient.mutation(api.tools.create, {
        name: "Planer",
        category: "power_tools",
        condition: "good",
        description: "Planer",
      });

      // 2. Own tool + bad dates -> FORBIDDEN (own tool check comes before date validation)
      await expect(
        ownerClient.mutation(api.loans.request, {
          toolId: tool2._id,
          startDate: "2026-13-01",
          endDate: "2026-13-05",
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      // 3. Bad dates + pending duplicate -> INVALID_INPUT (date validation comes before duplicate check)
      // Create a valid pending loan first
      await borrowerClient.mutation(api.loans.request, {
        toolId: tool2._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      // Second request with invalid dates fails with INVALID_INPUT (not CONFLICT)
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool2._id,
          startDate: "2026-13-01",
          endDate: "2026-13-05",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    });

    it("validates date constraints with INVALID_INPUT (R12, 30-day inclusive limit, calendar validity)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_dates");
      const { client: borrowerClient } = await asUser(t, "borrower_dates");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Circular Saw",
        category: "power_tools",
        condition: "good",
        description: "Saw",
      });

      // 1. Invalid date format
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-2",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 2. Bad month (2026-13-01)
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-13-01",
          endDate: "2026-13-05",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 3. Bad day for month: November has 30 days (2026-11-31)
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-31",
          endDate: "2026-12-05",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 4. Bad endDate format / value
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-20",
          endDate: "2026-11-bad",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 5. Non-existent calendar date (2026-02-29 is not a leap year)
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-02-29",
          endDate: "2026-03-05",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 6. Start date in the past (before 2026-11-15)
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-14",
          endDate: "2026-11-20",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 7. End date before start date
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-20",
          endDate: "2026-11-19",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 8. 31st day fails: 2026-11-15 to 2026-12-15 is (30 days diff + 1) = 31 days inclusive
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: tool._id,
          startDate: "2026-11-15",
          endDate: "2026-12-15",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 9. Valid boundary: 1-day duration (same start and end date)
      const loan1 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-15",
        endDate: "2026-11-15",
      });
      expect(loan1.status).toBe("pending");
      await borrowerClient.mutation(api.loans.cancel, { loanId: loan1._id });

      // 10. Valid boundary: exactly 30 days inclusive (2026-11-15 to 2026-12-14)
      const loan30 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-15",
        endDate: "2026-12-14",
      });
      expect(loan30.status).toBe("pending");
    });

    it("enforces R26: a borrower can have only one pending request per tool at a time (CONFLICT), but pending on tool A does not block tool B", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_r26");
      const { client: borrower1 } = await asUser(t, "borrower1_r26");
      const { client: borrower2 } = await asUser(t, "borrower2_r26");

      const toolA = await ownerClient.mutation(api.tools.create, {
        name: "Ladder",
        category: "other",
        condition: "good",
        description: "Tall ladder",
      });
      const toolB = await ownerClient.mutation(api.tools.create, {
        name: "Stepstool",
        category: "other",
        condition: "good",
        description: "Short stool",
      });

      // First request by borrower1 on tool A succeeds
      const req1 = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      expect(req1.status).toBe("pending");

      // Pending on tool A does NOT block borrower1 on tool B!
      const reqToolB = await borrower1.mutation(api.loans.request, {
        toolId: toolB._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      expect(reqToolB.status).toBe("pending");

      // Second request by borrower1 on tool A fails with CONFLICT
      await expect(
        borrower1.mutation(api.loans.request, {
          toolId: toolA._id,
          startDate: "2026-11-23",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

      // Another borrower (borrower2) CAN request tool A simultaneously
      const req2 = await borrower2.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      expect(req2.status).toBe("pending");

      // Once borrower1 cancels their pending request on tool A, they can request again
      await borrower1.mutation(api.loans.cancel, { loanId: req1._id });
      const req1New = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-26",
        endDate: "2026-11-28",
      });
      expect(req1New.status).toBe("pending");

      // Once owner declines req1New, borrower1 can request again
      await ownerClient.mutation(api.loans.decline, { loanId: req1New._id });
      const req1AfterDecline = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-29",
        endDate: "2026-11-30",
      });
      expect(req1AfterDecline.status).toBe("pending");
    });

    it("enforces rate limit of 15 loan requests per hour, rejecting 16th request with RATE_LIMITED (SEC-03)", async () => {
      const t = convexTest(schema, modules);
      const { user: owner } = await asUser(t, "owner_rl");
      const { client: borrowerClient } = await asUser(t, "borrower_rl");

      // Insert 16 tools directly in db to bypass tool creation rate limiting
      const toolIds = await t.run(async (ctx) => {
        const ids = [];
        for (let i = 1; i <= 16; i++) {
          const id = await ctx.db.insert("tools", {
            ownerId: owner._id,
            name: `Tool ${i}`,
            category: "power_tools",
            condition: "good",
            description: `Tool ${i} description`,
            status: "listed",
          });
          ids.push(id);
        }
        return ids;
      });

      // Submit 15 valid loan requests on distinct tools within the hourly window
      for (let i = 0; i < 15; i++) {
        await borrowerClient.mutation(api.loans.request, {
          toolId: toolIds[i],
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        });
      }

      // 16th loan request within the hourly window must reject with RATE_LIMITED
      await expect(
        borrowerClient.mutation(api.loans.request, {
          toolId: toolIds[15],
          startDate: "2026-11-20",
          endDate: "2026-11-25",
        })
      ).rejects.toMatchObject({
        data: {
          code: "RATE_LIMITED",
          message: "Loan request rate limit exceeded (maximum 15 requests per hour).",
        },
      });
    });
  });

  describe("actions & authorization order (R13, R14, R15, R16, R17, R19, R27, R28)", () => {
    it("enforces R28 order: non-existent (deleted) loan returns NOT_FOUND", async () => {
      const t = convexTest(schema, modules);
      const { client: user } = await asUser(t, "user_not_found");

      // Real deleted loan ID
      const deletedLoanId = await t.run(async (ctx) => {
        const u = await ctx.db.insert("users", {
          clerkId: "clerk_temp",
          tokenIdentifier: "clerk_temp",
          email: "temp@example.com",
          name: "Temp",
          role: "user",
          trustedLender: false,
        });
        const tool = await ctx.db.insert("tools", {
          ownerId: u,
          name: "Temp",
          category: "other",
          condition: "good",
          description: "Temp",
          status: "listed",
        });
        const loan = await ctx.db.insert("loans", {
          toolId: tool,
          ownerId: u,
          borrowerId: u,
          startDate: "2026-11-20",
          endDate: "2026-11-22",
          status: "pending",
        });
        await ctx.db.delete(loan);
        return loan;
      });

      await expect(
        user.mutation(api.loans.approve, { loanId: deletedLoanId })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      await expect(
        user.mutation(api.loans.decline, { loanId: deletedLoanId })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      await expect(
        user.mutation(api.loans.cancel, { loanId: deletedLoanId })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      await expect(
        user.mutation(api.loans.markReturned, { loanId: deletedLoanId })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("enforces R28 order: third party and non-participant admin get NOT_FOUND (R18, R19)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_authz");
      const { client: borrowerClient } = await asUser(t, "borrower_authz");
      const { client: thirdParty } = await asUser(t, "third_party_authz");
      const { client: adminClient } = await asUser(t, "admin_authz", true);

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Hedge Trimmer",
        category: "garden",
        condition: "good",
        description: "Sharp",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      // Third party user gets NOT_FOUND on all actions
      await expect(
        thirdParty.mutation(api.loans.approve, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        thirdParty.mutation(api.loans.decline, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        thirdParty.mutation(api.loans.cancel, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        thirdParty.mutation(api.loans.markReturned, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      // Admin (not a participant) also gets NOT_FOUND per R28 and R19
      await expect(
        adminClient.mutation(api.loans.approve, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        adminClient.mutation(api.loans.decline, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        adminClient.mutation(api.loans.cancel, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
      await expect(
        adminClient.mutation(api.loans.markReturned, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("allows admin who owns the tool to approve (participant rights apply to admins)", async () => {
      const t = convexTest(schema, modules);
      const { client: adminOwner } = await asUser(t, "admin_owner", true);
      const { client: borrowerClient } = await asUser(
        t,
        "borrower_from_admin"
      );

      const tool = await adminOwner.mutation(api.tools.create, {
        name: "Admin Drill",
        category: "power_tools",
        condition: "good",
        description: "Owned by admin",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      const approved = await adminOwner.mutation(api.loans.approve, {
        loanId: loan._id,
      });
      expect(approved.status).toBe("approved");
    });

    it("enforces R28 order: participant doing wrong action gets FORBIDDEN before transition check, and status is unchanged", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_roles");
      const { client: borrowerClient } = await asUser(t, "borrower_roles");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Wheelbarrow",
        category: "garden",
        condition: "fair",
        description: "Heavy duty",
      });

      // Case 1: Borrower marks returned on pending loan -> FORBIDDEN (before transition check!)
      const loan1 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      await expect(
        borrowerClient.mutation(api.loans.markReturned, { loanId: loan1._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      let stored1 = await t.run(async (ctx) =>
        ctx.db.get(loan1._id as Id<"loans">)
      );
      expect(stored1?.status).toBe("pending");

      // Case 2: Owner cancels an approved loan -> FORBIDDEN (before transition check!)
      await ownerClient.mutation(api.loans.approve, { loanId: loan1._id });
      await expect(
        ownerClient.mutation(api.loans.cancel, { loanId: loan1._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      stored1 = await t.run(async (ctx) =>
        ctx.db.get(loan1._id as Id<"loans">)
      );
      expect(stored1?.status).toBe("approved");

      // Case 3: Borrower approves a declined loan -> FORBIDDEN (before transition check!)
      const loan2 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-23",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.decline, { loanId: loan2._id });

      await expect(
        borrowerClient.mutation(api.loans.approve, { loanId: loan2._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      const stored2 = await t.run(async (ctx) =>
        ctx.db.get(loan2._id as Id<"loans">)
      );
      expect(stored2?.status).toBe("declined");

      // Borrower declining own loan -> FORBIDDEN
      const loan3 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-26",
        endDate: "2026-11-28",
      });
      await expect(
        borrowerClient.mutation(api.loans.decline, { loanId: loan3._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      const stored3 = await t.run(async (ctx) =>
        ctx.db.get(loan3._id as Id<"loans">)
      );
      expect(stored3?.status).toBe("pending");
    });

    it("happy paths: decline, cancel, and markReturned set correct status and returnedAt", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_happy");
      const { client: borrowerClient } = await asUser(t, "borrower_happy");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Jigsaw",
        category: "power_tools",
        condition: "good",
        description: "Compact",
      });

      // 1. Decline
      const req1 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      const declined = await ownerClient.mutation(api.loans.decline, {
        loanId: req1._id,
      });
      expect(declined.status).toBe("declined");
      expect(declined.returnedAt).toBeNull();
      const storedDeclined = await t.run(async (ctx) =>
        ctx.db.get(req1._id as Id<"loans">)
      );
      expect(storedDeclined?.status).toBe("declined");
      expect(storedDeclined?.returnedAt).toBeUndefined();

      // 2. Cancel
      const req2 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-23",
        endDate: "2026-11-25",
      });
      const cancelled = await borrowerClient.mutation(api.loans.cancel, {
        loanId: req2._id,
      });
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.returnedAt).toBeNull();
      const storedCancelled = await t.run(async (ctx) =>
        ctx.db.get(req2._id as Id<"loans">)
      );
      expect(storedCancelled?.status).toBe("cancelled");
      expect(storedCancelled?.returnedAt).toBeUndefined();

      // 3. MarkReturned
      const req3 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-26",
        endDate: "2026-11-28",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: req3._id });
      const returnTime = new Date("2026-11-15T13:00:00Z").getTime();
      vi.setSystemTime(new Date(returnTime));
      const returned = await ownerClient.mutation(api.loans.markReturned, {
        loanId: req3._id,
      });
      expect(returned.status).toBe("returned");
      expect(returned.returnedAt).toBe(returnTime);
      const storedReturned = await t.run(async (ctx) =>
        ctx.db.get(req3._id as Id<"loans">)
      );
      expect(storedReturned?.status).toBe("returned");
      expect(storedReturned?.returnedAt).toBe(returnTime);
    });

    it("enforces R16: invalid state transitions throw INVALID_TRANSITION and preserve stored status (including approving already-approved)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_transitions");
      const { client: borrowerClient } = await asUser(
        t,
        "borrower_transitions"
      );

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Impact Driver",
        category: "power_tools",
        condition: "new",
        description: "Cordless",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      // 1. markReturned on a pending loan -> INVALID_TRANSITION
      await expect(
        ownerClient.mutation(api.loans.markReturned, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      let stored = await t.run(async (ctx) =>
        ctx.db.get(loan._id as Id<"loans">)
      );
      expect(stored?.status).toBe("pending");

      // Approve loan to move to "approved"
      await ownerClient.mutation(api.loans.approve, { loanId: loan._id });

      // 2. approve on an already approved loan -> INVALID_TRANSITION
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      stored = await t.run(async (ctx) => ctx.db.get(loan._id as Id<"loans">));
      expect(stored?.status).toBe("approved");

      // 3. decline on an approved loan -> INVALID_TRANSITION
      await expect(
        ownerClient.mutation(api.loans.decline, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      stored = await t.run(async (ctx) => ctx.db.get(loan._id as Id<"loans">));
      expect(stored?.status).toBe("approved");

      // 4. cancel on an approved loan -> INVALID_TRANSITION
      await expect(
        borrowerClient.mutation(api.loans.cancel, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      stored = await t.run(async (ctx) => ctx.db.get(loan._id as Id<"loans">));
      expect(stored?.status).toBe("approved");

      // Mark returned to move to "returned" (terminal)
      await ownerClient.mutation(api.loans.markReturned, {
        loanId: loan._id,
      });

      // 5. any action on returned loan -> INVALID_TRANSITION
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      await expect(
        ownerClient.mutation(api.loans.decline, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      await expect(
        borrowerClient.mutation(api.loans.cancel, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      await expect(
        ownerClient.mutation(api.loans.markReturned, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_TRANSITION" } });
      stored = await t.run(async (ctx) => ctx.db.get(loan._id as Id<"loans">));
      expect(stored?.status).toBe("returned");
    });

    it("verifies lifecycle edge cases: overdue return, post-expiration/removal decline/cancel, active start approve (11-26..11-30 approved at 11-28)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_edge");
      const { client: borrowerClient } = await asUser(t, "borrower_edge");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Posthole Digger",
        category: "garden",
        condition: "good",
        description: "Heavy",
      });

      // 1. Overdue approved loan can be marked returned
      const loanOverdue = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-15",
        endDate: "2026-11-18",
      });
      await ownerClient.mutation(api.loans.approve, {
        loanId: loanOverdue._id,
      });

      // Advance clock past endDate (to 2026-11-20) -> now overdue
      vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
      const overduePinnedTime = new Date("2026-11-20T12:00:00Z").getTime();
      const returnedOverdue = await ownerClient.mutation(
        api.loans.markReturned,
        {
          loanId: loanOverdue._id,
        }
      );
      expect(returnedOverdue.status).toBe("returned");
      expect(returnedOverdue.returnedAt).toBe(overduePinnedTime);

      // 2. Decline and cancel work after endDate passed and after tool removal
      // Reset clock to 2026-11-20
      const toolDecline = await ownerClient.mutation(api.tools.create, {
        name: "Tool Decline",
        category: "other",
        condition: "good",
        description: "Decline test",
      });
      const toolCancel = await ownerClient.mutation(api.tools.create, {
        name: "Tool Cancel",
        category: "other",
        condition: "good",
        description: "Cancel test",
      });
      const loanExp = await borrowerClient.mutation(api.loans.request, {
        toolId: toolDecline._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      const loanCancelExp = await borrowerClient.mutation(api.loans.request, {
        toolId: toolCancel._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      // Advance clock past both endDates to 2026-11-26 and remove both tools
      vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
      await ownerClient.mutation(api.tools.remove, { toolId: toolDecline._id });
      await ownerClient.mutation(api.tools.remove, { toolId: toolCancel._id });

      // Decline works after expiration and tool removal
      const declinedAfterRemove = await ownerClient.mutation(
        api.loans.decline,
        {
          loanId: loanExp._id,
        }
      );
      expect(declinedAfterRemove.status).toBe("declined");

      // Cancel works after expiration and tool removal
      const cancelledAfterRemove = await borrowerClient.mutation(
        api.loans.cancel,
        {
          loanId: loanCancelExp._id,
        }
      );
      expect(cancelledAfterRemove.status).toBe("cancelled");

      // 3. Loan already started (request 11-26..11-30, advance clock to 11-28, approve succeeds!)
      const tool2 = await ownerClient.mutation(api.tools.create, {
        name: "Router",
        category: "power_tools",
        condition: "good",
        description: "Plunge router",
      });
      // Pinned time is 2026-11-26 when requested
      const activeLoan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool2._id,
        startDate: "2026-11-26",
        endDate: "2026-11-30",
      });
      // Advance clock to 2026-11-28 (loan already started)
      vi.setSystemTime(new Date("2026-11-28T12:00:00Z"));
      const approvedActive = await ownerClient.mutation(api.loans.approve, {
        loanId: activeLoan._id,
      });
      expect(approvedActive.status).toBe("approved");
    });

    it("enforces R27 & approve order: removed tool + expired gives CONFLICT (tool check before expired check)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_r27");
      const { client: borrowerClient } = await asUser(t, "borrower_r27");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Leaf Blower",
        category: "garden",
        condition: "good",
        description: "Gas powered",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      // Advance time past the loan's endDate (to 2026-11-23) -> expired
      vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));

      // 1. Expired request on listed tool -> INVALID_INPUT
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
      let stored = await t.run(async (ctx) =>
        ctx.db.get(loan._id as Id<"loans">)
      );
      expect(stored?.status).toBe("pending");

      // 2. Removed tool + expired -> CONFLICT (tool listed check comes before expired check)
      await ownerClient.mutation(api.tools.remove, { toolId: tool._id });
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loan._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      stored = await t.run(async (ctx) => ctx.db.get(loan._id as Id<"loans">));
      expect(stored?.status).toBe("pending");
    });

    it("enforces R17 overlap boundaries: exact end-date, contained, surrounding, multi-loan, non-blocking states, and different tool", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_overlap");
      const { client: borrower1 } = await asUser(t, "borrower1_overlap");
      const { client: borrower2 } = await asUser(t, "borrower2_overlap");

      const toolA = await ownerClient.mutation(api.tools.create, {
        name: "Rotary Hammer",
        category: "power_tools",
        condition: "good",
        description: "Tool A",
      });
      const toolB = await ownerClient.mutation(api.tools.create, {
        name: "Drill Press",
        category: "power_tools",
        condition: "good",
        description: "Tool B",
      });

      // Loan A: Nov 20 to Nov 25 -> approved
      const loanA = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loanA._id });

      // Boundary 1: starts on other's end date (Nov 25) -> CONFLICT_OVERLAP
      const loanEndTouch = await borrower2.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-25",
        endDate: "2026-11-27",
      });
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loanEndTouch._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT_OVERLAP" } });
      let stored = await t.run(async (ctx) =>
        ctx.db.get(loanEndTouch._id as Id<"loans">)
      );
      expect(stored?.status).toBe("pending");
      await borrower2.mutation(api.loans.cancel, { loanId: loanEndTouch._id });

      // Boundary 2: day after (Nov 26 to Nov 28) -> ok
      const loanDayAfter = await borrower2.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-26",
        endDate: "2026-11-28",
      });
      const approvedDayAfter = await ownerClient.mutation(api.loans.approve, {
        loanId: loanDayAfter._id,
      });
      expect(approvedDayAfter.status).toBe("approved");

      // Boundary 3: contained inside loanA (Nov 21 to Nov 24) -> CONFLICT_OVERLAP
      const loanContained = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-21",
        endDate: "2026-11-24",
      });
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loanContained._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT_OVERLAP" } });
      await borrower1.mutation(api.loans.cancel, { loanId: loanContained._id });

      // Boundary 4: surrounding loanA (Nov 19 to Nov 26) -> CONFLICT_OVERLAP
      const loanSurrounding = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-19",
        endDate: "2026-11-26",
      });
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loanSurrounding._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT_OVERLAP" } });
      await borrower1.mutation(api.loans.cancel, { loanId: loanSurrounding._id });

      // Multi-loan: toolA now has A(Nov 20-25) and DayAfter(Nov 26-28) approved.
      // Loan C on toolA: Nov 29 to Nov 30 -> approve
      const loanC = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-29",
        endDate: "2026-11-30",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loanC._id });

      // Loan D: Nov 28 to Nov 29 (touches Nov 26-28 and Nov 29-30) -> CONFLICT_OVERLAP
      const loanD = await borrower2.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-28",
        endDate: "2026-11-29",
      });
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loanD._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT_OVERLAP" } });
      await borrower2.mutation(api.loans.cancel, { loanId: loanD._id });

      // Different tool never blocks: loan on toolB overlapping loanA dates succeeds
      const loanToolB = await borrower1.mutation(api.loans.request, {
        toolId: toolB._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      const approvedToolB = await ownerClient.mutation(api.loans.approve, {
        loanId: loanToolB._id,
      });
      expect(approvedToolB.status).toBe("approved");

      // Non-blocking states: once loanA is marked returned, overlapping dates can be approved
      await ownerClient.mutation(api.loans.markReturned, { loanId: loanA._id });
      const loanOverReturned = await borrower2.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      const approvedOverReturned = await ownerClient.mutation(
        api.loans.approve,
        {
          loanId: loanOverReturned._id,
        }
      );
      expect(approvedOverReturned.status).toBe("approved");

      // Declined and cancelled overlapping loans do NOT block:
      // Create a loan overlapping approvedOverReturned, decline it
      const loanToDecline = await borrower1.mutation(api.loans.request, {
        toolId: toolB._id,
        startDate: "2026-12-01",
        endDate: "2026-12-05",
      });
      await ownerClient.mutation(api.loans.decline, { loanId: loanToDecline._id });

      // Now request the same dates on toolB and approve -> succeeds!
      const loanAfterDecline = await borrower2.mutation(api.loans.request, {
        toolId: toolB._id,
        startDate: "2026-12-01",
        endDate: "2026-12-05",
      });
      const approvedAfterDecline = await ownerClient.mutation(api.loans.approve, {
        loanId: loanAfterDecline._id,
      });
      expect(approvedAfterDecline.status).toBe("approved");

      // Create another loan and cancel it
      const loanToCancel = await borrower1.mutation(api.loans.request, {
        toolId: toolB._id,
        startDate: "2026-12-06",
        endDate: "2026-12-10",
      });
      await borrower1.mutation(api.loans.cancel, { loanId: loanToCancel._id });

      // Now request the same dates and approve -> succeeds!
      const loanAfterCancel = await borrower2.mutation(api.loans.request, {
        toolId: toolB._id,
        startDate: "2026-12-06",
        endDate: "2026-12-10",
      });
      const approvedAfterCancel = await ownerClient.mutation(api.loans.approve, {
        loanId: loanAfterCancel._id,
      });
      expect(approvedAfterCancel.status).toBe("approved");

      // Overlapping pending loans: approve one, then CONFLICT_OVERLAP for the other
      const pendingP1 = await borrower1.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-12-11",
        endDate: "2026-12-15",
      });
      const pendingP2 = await borrower2.mutation(api.loans.request, {
        toolId: toolA._id,
        startDate: "2026-12-12",
        endDate: "2026-12-16",
      });
      // Approve P1
      await ownerClient.mutation(api.loans.approve, { loanId: pendingP1._id });
      // Approving P2 now conflicts with P1
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: pendingP2._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT_OVERLAP" } });
    });

    it("overlap boundary on the other side: approved loan 2026-11-26..2026-11-28 blocks new loan 2026-11-24..2026-11-26", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_overlap_reverse");
      const { client: borrower1 } = await asUser(t, "borrower1_overlap_reverse");
      const { client: borrower2 } = await asUser(t, "borrower2_overlap_reverse");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Recip Saw",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      // Approved loan: Nov 26 to Nov 28
      const loanApproved = await borrower1.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-26",
        endDate: "2026-11-28",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loanApproved._id });

      // New loan ending on approved loan's start date (Nov 24 to Nov 26) -> CONFLICT_OVERLAP
      const loanEndTouch = await borrower2.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-24",
        endDate: "2026-11-26",
      });
      await expect(
        ownerClient.mutation(api.loans.approve, { loanId: loanEndTouch._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT_OVERLAP" } });
      let stored = await t.run(async (ctx) =>
        ctx.db.get(loanEndTouch._id as Id<"loans">)
      );
      expect(stored?.status).toBe("pending");
    });

    it("seeded approved loan with returnedAt set does not block approving an overlapping loan", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_returned_overlap");
      const { client: borrower1 } = await asUser(t, "borrower1_returned_overlap");
      const { client: borrower2 } = await asUser(t, "borrower2_returned_overlap");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Angle Grinder",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      // Seed an approved loan with returnedAt set (returned) via t.run
      const baseTime = new Date("2026-11-15T12:00:00Z").getTime();
      // Get user IDs first (asUser creates users with known clerkIds)
      const ownerUser = await t.run(async (ctx) =>
        ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "clerk_owner_returned_overlap")).unique()
      );
      const borrower1User = await t.run(async (ctx) =>
        ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "clerk_borrower1_returned_overlap")).unique()
      );
      if (!ownerUser || !borrower1User) throw new Error("Users not found");
      const returnedLoanId = await t.run(async (ctx) => {
        return await ctx.db.insert("loans", {
          toolId: tool._id,
          ownerId: ownerUser._id,
          borrowerId: borrower1User._id,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
          status: "approved",
          returnedAt: baseTime,
        });
      });

      // New loan overlapping the returned loan's dates should be approvable
      const newLoan = await borrower2.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-22",
        endDate: "2026-11-27",
      });
      const approved = await ownerClient.mutation(api.loans.approve, { loanId: newLoan._id });
      expect(approved.status).toBe("approved");
    });
  });

  describe("queries, projections & privacy (R18, R29)", () => {
    it("listMine returns borrower's loans with exact projected keys, counterpartyName as owner, and null returnedAt", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(
        t,
        "owner_proj"
      );
      const { client: borrowerClient } = await asUser(
        t,
        "borrower_proj"
      );

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Table Saw",
        category: "other",
        condition: "good",
        description: "Precision",
      });

      const req = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });

      const mine = await borrowerClient.query(api.loans.listMine, {});
      expect(mine).toHaveLength(1);
      expect(mine[0]._id).toBe(req._id);
      expect(mine[0].toolName).toBe("Table Saw");
      expect(mine[0].counterpartyName).toBe(owner.name);
      expect(mine[0].status).toBe("pending");
      expect(mine[0].returnedAt).toBeNull();

      const keys = Object.keys(mine[0]).sort();
      expect(keys).toEqual(
        [
          "_id",
          "counterpartyName",
          "endDate",
          "returnedAt",
          "startDate",
          "status",
          "toolName",
        ].sort()
      );
    });

    it("listIncoming returns owner's tool loans with exact projected keys, counterpartyName as borrower, and null returnedAt", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(
        t,
        "owner_incoming"
      );
      const { client: borrowerClient, user: borrower } = await asUser(
        t,
        "borrower_incoming"
      );

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Pressure Washer",
        category: "cleaning",
        condition: "new",
        description: "3000 PSI",
      });

      const req = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });

      const incoming = await ownerClient.query(api.loans.listIncoming, {});
      expect(incoming).toHaveLength(1);
      expect(incoming[0]._id).toBe(req._id);
      expect(incoming[0].toolName).toBe("Pressure Washer");
      expect(incoming[0].counterpartyName).toBe(borrower.name);
      expect(incoming[0].status).toBe("pending");
      expect(incoming[0].returnedAt).toBeNull();

      const keys = Object.keys(incoming[0]).sort();
      expect(keys).toEqual(
        [
          "_id",
          "counterpartyName",
          "endDate",
          "returnedAt",
          "startDate",
          "status",
          "toolName",
        ].sort()
      );
    });

    it("privacy check: JSON.stringify of listMine and listIncoming contains no email or clerk ID; roles don't see each other's lists", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_priv");
      const { client: borrowerClient } = await asUser(t, "borrower_priv");
      const { client: thirdParty } = await asUser(t, "third_priv");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Generator",
        category: "power_tools",
        condition: "good",
        description: "Quiet",
      });

      await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      const mine = await borrowerClient.query(api.loans.listMine, {});
      const incoming = await ownerClient.query(api.loans.listIncoming, {});

      const mineStr = JSON.stringify(mine);
      const incomingStr = JSON.stringify(incoming);

      expect(mineStr).not.toContain("example.com");
      expect(mineStr).not.toContain("clerk_");
      expect(incomingStr).not.toContain("example.com");
      expect(incomingStr).not.toContain("clerk_");

      // Owner's listMine is empty (owner is not a borrower)
      const ownerMine = await ownerClient.query(api.loans.listMine, {});
      expect(ownerMine).toHaveLength(0);

      // Borrower's listIncoming is empty (borrower owns no tools with requests)
      const borrowerIncoming = await borrowerClient.query(
        api.loans.listIncoming,
        {}
      );
      expect(borrowerIncoming).toHaveLength(0);

      // Third party user sees 0 loans in both lists
      expect(await thirdParty.query(api.loans.listMine, {})).toHaveLength(0);
      expect(await thirdParty.query(api.loans.listIncoming, {})).toHaveLength(0);
    });

    it("listIncoming supports optional status filter", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient } = await asUser(t, "owner_filter");
      const { client: borrowerClient } = await asUser(t, "borrower_filter");

      const tool1 = await ownerClient.mutation(api.tools.create, {
        name: "Tool One",
        category: "other",
        condition: "good",
        description: "One",
      });
      const tool2 = await ownerClient.mutation(api.tools.create, {
        name: "Tool Two",
        category: "other",
        condition: "good",
        description: "Two",
      });

      const req1 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool1._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });
      const req2 = await borrowerClient.mutation(api.loans.request, {
        toolId: tool2._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      await ownerClient.mutation(api.loans.approve, { loanId: req1._id });

      const pendingOnly = await ownerClient.query(api.loans.listIncoming, {
        status: "pending",
      });
      expect(pendingOnly).toHaveLength(1);
      expect(pendingOnly[0]._id).toBe(req2._id);

      const approvedOnly = await ownerClient.query(api.loans.listIncoming, {
        status: "approved",
      });
      expect(approvedOnly).toHaveLength(1);
      expect(approvedOnly[0]._id).toBe(req1._id);
    });

    it("enforces 201-loan cap on listMine and listIncoming with newest first ordering (deterministic clock tick)", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(
        t,
        "owner_cap"
      );
      const { client: borrowerClient, user: borrower } = await asUser(
        t,
        "borrower_cap"
      );

      const baseTime = new Date("2026-11-15T12:00:00Z").getTime();

      // Seed 201 tools and loans directly in DB advancing clock 1ms per row for deterministic _creationTime
      await t.run(async (ctx) => {
        for (let i = 0; i < 201; i++) {
          vi.setSystemTime(new Date(baseTime + i));
          const tool = await ctx.db.insert("tools", {
            ownerId: owner._id,
            name: `Tool ${i}`,
            category: "other",
            condition: "good",
            description: "Bulk tool",
            status: "listed",
          });
          await ctx.db.insert("loans", {
            toolId: tool,
            ownerId: owner._id,
            borrowerId: borrower._id,
            startDate: "2026-11-20",
            endDate: "2026-11-22",
            status: "pending",
          });
        }
      });
      // Restore pinned time
      vi.setSystemTime(new Date(baseTime));

      // 1. listMine cap & order
      const mine = await borrowerClient.query(api.loans.listMine, {});
      expect(mine).toHaveLength(200);
      // Newest first: the first item returned is the last inserted ("Tool 200")
      expect(mine[0].toolName).toBe("Tool 200");
      // Oldest ("Tool 0") should be capped out
      const tool0InMine = mine.some(
        (l: { toolName: string }) => l.toolName === "Tool 0"
      );
      expect(tool0InMine).toBe(false);

      // 2. listIncoming cap & order
      const incoming = await ownerClient.query(api.loans.listIncoming, {});
      expect(incoming).toHaveLength(200);
      expect(incoming[0].toolName).toBe("Tool 200");
      const tool0InIncoming = incoming.some(
        (l: { toolName: string }) => l.toolName === "Tool 0"
      );
      expect(tool0InIncoming).toBe(false);
    });

    it("enforces listIncoming without status filter orders newest-first across mixed statuses and does not drop newest approved loan under 200 cap", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(
        t,
        "owner_mixed_cap"
      );
      const { user: borrower } = await asUser(t, "borrower_mixed_cap");

      const baseTime = new Date("2026-11-15T12:00:00Z").getTime();
      const statuses = [
        "returned",
        "cancelled",
        "declined",
        "pending",
      ] as const;

      // Seed 205 loans: first 204 are mixed non-approved statuses, loan 204 (the newest) is "approved"
      await t.run(async (ctx) => {
        for (let i = 0; i < 205; i++) {
          vi.setSystemTime(new Date(baseTime + i));
          const tool = await ctx.db.insert("tools", {
            ownerId: owner._id,
            name: `Tool ${i}`,
            category: "other",
            condition: "good",
            description: "Bulk tool",
            status: "listed",
          });
          const status =
            i === 204 ? ("approved" as const) : statuses[i % statuses.length];
          await ctx.db.insert("loans", {
            toolId: tool,
            ownerId: owner._id,
            borrowerId: borrower._id,
            startDate: "2026-11-20",
            endDate: "2026-11-22",
            status,
            ...(status === "returned" ? { returnedAt: baseTime + i } : {}),
          });
        }
      });
      vi.setSystemTime(new Date(baseTime));

      const incoming = await ownerClient.query(api.loans.listIncoming, {});
      expect(incoming).toHaveLength(200);
      // Newest loan is Tool 204 (approved)
      expect(incoming[0].toolName).toBe("Tool 204");
      expect(incoming[0].status).toBe("approved");
      // Check that newest "approved" loan is present (not dropped by the cap)
      const approvedInIncoming = incoming.some(
        (l: { toolName: string }) => l.toolName === "Tool 204"
      );
      expect(approvedInIncoming).toBe(true);
    });
  });
});

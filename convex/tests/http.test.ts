/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";
import { asUser } from "./helpers";
import { Id } from "../_generated/dataModel";
import { signPayload } from "../lib/hmac";

const modules = import.meta.glob(["../**/*.ts", "!../tests/**"]);

const PINNED_TIME = new Date("2026-11-15T12:00:00Z").getTime();

describe("HTTP internal functions", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    process.env.N8N_API_SECRET = "test-secret-32-bytes-length!!";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("internal.loans.getOverdue", () => {
    it("returns empty array when no overdue loans", async () => {
      const t = convexTest(schema, modules);
      const overdue = await t.query(internal.loans.getOverdue, {});
      expect(Array.isArray(overdue)).toBe(true);
      expect(overdue.length).toBe(0);
    });

    it("returns overdue loans with correct fields", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Overdue Tool",
        category: "power_tools",
        condition: "good",
        description: "Test tool",
      });

      // Create loan directly with past endDate to test overdue detection
      const loanId = await t.mutation(async (ctx) => {
        return await ctx.db.insert("loans", {
          toolId: tool._id,
          borrowerId: borrower._id,
          ownerId: owner._id,
          startDate: "2026-11-10",
          endDate: "2026-11-14", // past date
          status: "approved",
        });
      });

      const overdue = await t.query(internal.loans.getOverdue, {});
      expect(overdue.length).toBeGreaterThanOrEqual(1);
      const overdueLoan = overdue.find((o) => o.loanId === loanId);
      expect(overdueLoan).toBeDefined();
      expect(overdueLoan?.loanId).toBe(loanId);
      expect(overdueLoan?.borrowerEmail).toBe(borrower.email);
      expect(overdueLoan?.toolName).toBe(tool.name);
      expect(overdueLoan?.dueDate).toBe("2026-11-14");
    });

    it("excludes loans that are already returned", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test2");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test2");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Returned Tool",
        category: "power_tools",
        condition: "good",
        description: "Test tool",
      });

      // Create loan directly with past endDate and returnedAt set
      const loanId = await t.mutation(async (ctx) => {
        return await ctx.db.insert("loans", {
          toolId: tool._id,
          borrowerId: borrower._id,
          ownerId: owner._id,
          startDate: "2026-11-10",
          endDate: "2026-11-14",
          status: "approved",
          returnedAt: Date.now(),
        });
      });

      const overdue = await t.query(internal.loans.getOverdue, {});
      const overdueLoan = overdue.find((o) => o.loanId === loanId);
      expect(overdueLoan).toBeUndefined();
    });

    it("excludes loans that are not approved", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test3");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test3");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Pending Tool",
        category: "power_tools",
        condition: "good",
        description: "Test tool",
      });

      // Create loan directly with past endDate but pending status
      const loanId = await t.mutation(async (ctx) => {
        return await ctx.db.insert("loans", {
          toolId: tool._id,
          borrowerId: borrower._id,
          ownerId: owner._id,
          startDate: "2026-11-10",
          endDate: "2026-11-14",
          status: "pending",
        });
      });

      const overdue = await t.query(internal.loans.getOverdue, {});
      const overdueLoan = overdue.find((o) => o.loanId === loanId);
      expect(overdueLoan).toBeUndefined();
    });
  });

  describe("internal.automation.recordReminder", () => {
    it("creates a row with status=sent", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test3");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test3");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Test Tool 3",
        category: "power_tools",
        condition: "good",
        description: "Test tool",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loan._id });

      const eventId = await t.mutation(internal.automation.recordReminder, {
        loanId: loan._id,
        idempotencyKey: "evt_reminder_test",
      });

      expect(eventId).toBeDefined();

      const event = await t.run(async (ctx) => ctx.db.get(eventId));
      expect(event).toBeDefined();
      expect(event?.loanId).toBe(loan._id);
      expect(event?.type).toBe("overdue_reminder");
      expect(event?.idempotencyKey).toBe("evt_reminder_test");
      expect(event?.status).toBe("sent");
      expect(event?.attempts).toBe(0);
    });

    it("duplicate idempotencyKey returns same event ID", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test2");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test2");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Test Tool 2",
        category: "power_tools",
        condition: "good",
        description: "Test tool",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loan._id });

      const eventId1 = await t.mutation(internal.automation.recordReminder, {
        loanId: loan._id,
        idempotencyKey: "evt_reminder_duplicate",
      });

      const eventId2 = await t.mutation(internal.automation.recordReminder, {
        loanId: loan._id,
        idempotencyKey: "evt_reminder_duplicate",
      });

      expect(eventId2).toBe(eventId1);

      const event = await t.run(async (ctx) => ctx.db.get(eventId1));
      expect(event?.type).toBe("overdue_reminder");
    });
  });
});

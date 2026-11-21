/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";
import { asUser } from "./helpers";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob(["../**/*.ts", "!../tests/**"]);

const PINNED_TIME = new Date("2026-11-15T12:00:00Z").getTime();

describe("automation", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("insertOutboxEvent", () => {
    it("creates a row and schedules the action", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Test Tool",
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

      const eventId = await t.mutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.requested",
        idempotencyKey: "evt_test_123",
      });

      expect(eventId).toBeDefined();

      const event = await t.run(async (ctx) => ctx.db.get(eventId));
      expect(event).toBeDefined();
      expect(event?.loanId).toBe(loan._id);
      expect(event?.type).toBe("loan.requested");
      expect(event?.idempotencyKey).toBe("evt_test_123");
      expect(event?.status).toBe("queued");
      expect(event?.attempts).toBe(0);
    });

    it("duplicate idempotencyKey inserts are safely ignored (idempotent)", async () => {
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

      const eventId1 = await t.mutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.requested",
        idempotencyKey: "evt_duplicate",
      });

      const eventId2 = await t.mutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.approved", // different type, same key
        idempotencyKey: "evt_duplicate",
      });

      expect(eventId2).toBe(eventId1);

      const event = await t.run(async (ctx) => ctx.db.get(eventId1));
      expect(event?.type).toBe("loan.requested"); // original type preserved
    });
  });

  describe("markEventFailed", () => {
    it("correctly increments the attempts counter and updates the lastError string", async () => {
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

      const eventId = await t.mutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.requested",
        idempotencyKey: "evt_fail_test",
      });

      await t.mutation(internal.automation.markEventFailed, {
        eventId,
        error: "Network timeout",
      });

      let event = await t.run(async (ctx) => ctx.db.get(eventId));
      expect(event?.attempts).toBe(1);
      expect(event?.lastError).toBe("Network timeout");
      expect(event?.status).toBe("queued");

      await t.mutation(internal.automation.markEventFailed, {
        eventId,
        error: "Second failure",
      });

      event = await t.run(async (ctx) => ctx.db.get(eventId));
      expect(event?.attempts).toBe(2);
      expect(event?.lastError).toBe("Second failure");
      expect(event?.status).toBe("queued");

      // After 5 attempts, status should become failed
      for (let i = 2; i < 5; i++) {
        await t.mutation(internal.automation.markEventFailed, {
          eventId,
          error: "Failure " + (i + 1),
        });
      }

      const finalEvent = await t.run(async (ctx) => ctx.db.get(eventId));
      expect(finalEvent?.attempts).toBe(5);
      expect(finalEvent?.status).toBe("failed");
    });

    it("does not increment attempts if event is already sent", async () => {
      const t = convexTest(schema, modules);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_test4");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_test4");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Test Tool 4",
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

      const eventId = await t.mutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.requested",
        idempotencyKey: "evt_sent_test",
      });

      // Manually mark as sent
      await t.run(async (ctx) =>
        ctx.db.patch(eventId, { status: "sent", updatedAt: Date.now() })
      );

      await t.mutation(internal.automation.markEventFailed, {
        eventId,
        error: "Should not increment",
      });

      const event = await t.run(async (ctx) => ctx.db.get(eventId));
      expect(event?.attempts).toBe(0);
      expect(event?.status).toBe("sent");
    });
  });
});
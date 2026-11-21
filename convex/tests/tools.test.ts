/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import schema from "../schema";
import { api } from "../_generated/api";
import { today } from "../lib/dates";
import { asUser } from "./helpers";

const modules = import.meta.glob(["../**/*.ts", "!../tests/**"]);

describe("tools", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("authentication guards", () => {
    it("rejects unauthenticated calls with UNAUTHENTICATED on all protected endpoints", async () => {
      const t = convexTest(schema, modules);

      // create
      await expect(
        t.mutation(api.tools.create, {
          name: "Hammer",
          category: "power_tools",
          condition: "good",
          description: "Sturdy hammer",
        })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      // listMine
      await expect(t.query(api.tools.listMine, {})).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });

      // listAll
      await expect(t.query(api.tools.listAll, {})).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });

      // update and remove (with existing dummy tool)
      const fakeId = await t.run(async (ctx) => {
        const dummyUser = await ctx.db.insert("users", {
          clerkId: "clerk_dummy",
          tokenIdentifier: "clerk_dummy",
          email: "dummy@example.com",
          name: "Dummy",
          role: "user",
          trustedLender: false,
        });
        return await ctx.db.insert("tools", {
          ownerId: dummyUser,
          name: "Drill",
          category: "power_tools",
          condition: "new",
          description: "Cordless drill",
          status: "listed",
        });
      });

      await expect(
        t.mutation(api.tools.update, {
          toolId: fakeId,
          name: "Updated Drill",
          category: "power_tools",
          condition: "new",
          description: "Updated description",
        })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });

      await expect(
        t.mutation(api.tools.remove, { toolId: fakeId })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    });
  });

  describe("create & input validation (R4, R7)", () => {
    it("creates a tool with owner set to caller, status listed, and returns projected tool (R4)", async () => {
      const t = convexTest(schema, modules);
      const { client: alice, user: aliceUser } = await asUser(t, "alice");

      const tool = await alice.mutation(api.tools.create, {
        name: "  Rotary Hammer  ",
        category: "power_tools",
        condition: "new",
        description: "Heavy duty",
      });

      expect(tool.name).toBe("Rotary Hammer");
      expect(tool.category).toBe("power_tools");
      expect(tool.condition).toBe("new");
      expect(tool.description).toBe("Heavy duty");
      expect(tool.available).toBe(true);
      expect(tool.isMine).toBe(true);

      const stored = await t.run(async (ctx) => {
        return await ctx.db.get(tool._id);
      });
      expect(stored?.ownerId).toBe(aliceUser._id);
      expect(stored?.status).toBe("listed");
      expect(stored?.name).toBe("Rotary Hammer");
    });

    it("rejects ownerId or status arguments in create (R1, R4)", async () => {
      const t = convexTest(schema, modules);
      const { client: bob } = await asUser(t, "bob");

      const createWithDisallowed = api.tools.create as unknown as FunctionReference<
        "mutation",
        "public",
        Record<string, unknown>
      >;

      await expect(
        bob.mutation(createWithDisallowed, {
          name: "Saw",
          category: "power_tools",
          condition: "good",
          description: "Hand saw",
          ownerId: "fake_owner_id",
        })
      ).rejects.toThrow("Validator error: Unexpected field `ownerId` in object");

      await expect(
        bob.mutation(createWithDisallowed, {
          name: "Saw",
          category: "power_tools",
          condition: "good",
          description: "Hand saw",
          status: "removed",
        })
      ).rejects.toThrow("Validator error: Unexpected field `status` in object");
    });

    it("enforces name boundary rules (1 to 80 chars, trimmed, no whitespace-only) (R7)", async () => {
      const t = convexTest(schema, modules);
      const { client: bob } = await asUser(t, "bob");

      // 1 char: allowed
      const tool1 = await bob.mutation(api.tools.create, {
        name: "X",
        category: "other",
        condition: "good",
        description: "",
      });
      expect(tool1.name).toBe("X");

      // 80 chars: allowed
      const tool80 = await bob.mutation(api.tools.create, {
        name: "A".repeat(80),
        category: "other",
        condition: "good",
        description: "",
      });
      expect(tool80.name).toBe("A".repeat(80));

      // 81 chars: rejected with INVALID_INPUT
      await expect(
        bob.mutation(api.tools.create, {
          name: "A".repeat(81),
          category: "other",
          condition: "good",
          description: "",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // Whitespace-only name: rejected with INVALID_INPUT
      await expect(
        bob.mutation(api.tools.create, {
          name: "     ",
          category: "other",
          condition: "good",
          description: "",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // Trimming: "  " + 80 chars + "  " passes and stores trimmed name
      const toolTrimmed80 = await bob.mutation(api.tools.create, {
        name: "  " + "B".repeat(80) + "  ",
        category: "other",
        condition: "good",
        description: "",
      });
      expect(toolTrimmed80.name).toBe("B".repeat(80));

      // Trimming: 81 chars with surrounding spaces fails with INVALID_INPUT
      await expect(
        bob.mutation(api.tools.create, {
          name: "  " + "B".repeat(81) + "  ",
          category: "other",
          condition: "good",
          description: "",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    });

    it("enforces description boundary rules (max 500 chars) (R7)", async () => {
      const t = convexTest(schema, modules);
      const { client: bob } = await asUser(t, "bob");

      // 500 chars: allowed
      const tool500 = await bob.mutation(api.tools.create, {
        name: "Trowel",
        category: "garden",
        condition: "fair",
        description: "D".repeat(500),
      });
      expect(tool500.description).toHaveLength(500);

      // 501 chars: rejected with INVALID_INPUT
      await expect(
        bob.mutation(api.tools.create, {
          name: "Trowel",
          category: "garden",
          condition: "fair",
          description: "D".repeat(501),
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    });

    it("rejects invalid category and condition enums, matches Validator error, and creates no row (R7)", async () => {
      const t = convexTest(schema, modules);
      const { client: bob } = await asUser(t, "bob");

      const createWithInvalid = api.tools.create as unknown as FunctionReference<
        "mutation",
        "public",
        Record<string, unknown>
      >;

      await expect(
        bob.mutation(createWithInvalid, {
          name: "Wrench",
          category: "invalid_category",
          condition: "good",
          description: "Wrench",
        })
      ).rejects.toThrow(/Validator error.*invalid_category/);

      await expect(
        bob.mutation(createWithInvalid, {
          name: "Wrench",
          category: "power_tools",
          condition: "broken",
          description: "Wrench",
        })
      ).rejects.toThrow(/Validator error.*broken/);

      const toolCount = await t.run(async (ctx) => {
        const tools = await ctx.db.query("tools").collect();
        return tools.length;
      });
      expect(toolCount).toBe(0);
    });

    it("enforces rate limit of 15 tools per hour, rejecting 16th tool with RATE_LIMITED (SEC-03)", async () => {
      const t = convexTest(schema, modules);
      const { client: alice } = await asUser(t, "alice");

      for (let i = 1; i <= 15; i++) {
        await alice.mutation(api.tools.create, {
          name: `Tool ${i}`,
          category: "other",
          condition: "good",
          description: `Description ${i}`,
        });
      }

      await expect(
        alice.mutation(api.tools.create, {
          name: "Tool 16",
          category: "other",
          condition: "good",
          description: "Description 16",
        })
      ).rejects.toMatchObject({
        data: {
          code: "RATE_LIMITED",
          message: "Tool creation rate limit exceeded (maximum 15 tools per hour).",
        },
      });
    });
  });

  describe("update (R5)", () => {
    it("allows owner to update all fields, trims the name, and preserves ownerId (R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");

      const tool = await owner.mutation(api.tools.create, {
        name: "Old Mower",
        category: "garden",
        condition: "fair",
        description: "Old",
      });

      const updated = await owner.mutation(api.tools.update, {
        toolId: tool._id,
        name: "  Electric Lawn Mower  ",
        category: "garden",
        condition: "good",
        description: "Updated description",
      });

      expect(updated.name).toBe("Electric Lawn Mower");
      expect(updated.condition).toBe("good");
      expect(updated.description).toBe("Updated description");
      expect(updated.isMine).toBe(true);

      const stored = await t.run(async (ctx) => ctx.db.get(tool._id));
      expect(stored?.name).toBe("Electric Lawn Mower");
      expect(stored?.condition).toBe("good");
      expect(stored?.ownerId).toBe(ownerUser._id);
    });

    it("enforces validation on update: 81-char name, whitespace name, 501-char desc fail and stored doc is unchanged (R7)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");

      const tool = await owner.mutation(api.tools.create, {
        name: "Original Name",
        category: "kitchen",
        condition: "new",
        description: "Original description",
      });

      // 81-char name fails
      await expect(
        owner.mutation(api.tools.update, {
          toolId: tool._id,
          name: "Z".repeat(81),
          category: "kitchen",
          condition: "new",
          description: "Original description",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // Whitespace name fails
      await expect(
        owner.mutation(api.tools.update, {
          toolId: tool._id,
          name: "    ",
          category: "kitchen",
          condition: "new",
          description: "Original description",
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // 501-char description fails
      await expect(
        owner.mutation(api.tools.update, {
          toolId: tool._id,
          name: "Original Name",
          category: "kitchen",
          condition: "new",
          description: "E".repeat(501),
        })
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });

      // Verify stored document is completely unchanged
      const stored = await t.run(async (ctx) => ctx.db.get(tool._id));
      expect(stored?.name).toBe("Original Name");
      expect(stored?.description).toBe("Original description");
    });

    it("rejects non-owner user with FORBIDDEN (R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");
      const { client: other } = await asUser(t, "other");

      const tool = await owner.mutation(api.tools.create, {
        name: "Ladder",
        category: "other",
        condition: "good",
        description: "Step ladder",
      });

      await expect(
        other.mutation(api.tools.update, {
          toolId: tool._id,
          name: "Hacked Ladder",
          category: "other",
          condition: "worn",
          description: "Hacked",
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("rejects admin with FORBIDDEN (admins cannot update others tools) (R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");
      const { client: admin } = await asUser(t, "admin", true);

      const tool = await owner.mutation(api.tools.create, {
        name: "Ladder",
        category: "other",
        condition: "good",
        description: "Step ladder",
      });

      await expect(
        admin.mutation(api.tools.update, {
          toolId: tool._id,
          name: "Admin Edited Ladder",
          category: "other",
          condition: "good",
          description: "Edited by admin",
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("rejects ownerId or status args on update (R1, R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");

      const tool = await owner.mutation(api.tools.create, {
        name: "Tent",
        category: "camping",
        condition: "new",
        description: "4-person tent",
      });

      const updateWithDisallowed = api.tools.update as unknown as FunctionReference<
        "mutation",
        "public",
        Record<string, unknown>
      >;

      await expect(
        owner.mutation(updateWithDisallowed, {
          toolId: tool._id,
          name: "Tent",
          category: "camping",
          condition: "new",
          description: "4-person tent",
          ownerId: "new_owner",
        })
      ).rejects.toThrow("Validator error: Unexpected field `ownerId` in object");

      await expect(
        owner.mutation(updateWithDisallowed, {
          toolId: tool._id,
          name: "Tent",
          category: "camping",
          condition: "new",
          description: "4-person tent",
          status: "removed",
        })
      ).rejects.toThrow("Validator error: Unexpected field `status` in object");
    });

    it("throws NOT_FOUND on missing, deleted, or already-removed tool on update", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");

      const tool = await owner.mutation(api.tools.create, {
        name: "Tent",
        category: "camping",
        condition: "new",
        description: "Tent",
      });

      // 1. Updating already-removed tool throws NOT_FOUND
      await owner.mutation(api.tools.remove, { toolId: tool._id });
      await expect(
        owner.mutation(api.tools.update, {
          toolId: tool._id,
          name: "Tent v2",
          category: "camping",
          condition: "good",
          description: "Tent",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      // 2. Updating physically deleted row throws NOT_FOUND
      const tool2 = await owner.mutation(api.tools.create, {
        name: "Tent 2",
        category: "camping",
        condition: "new",
        description: "Tent",
      });
      await t.run(async (ctx) => ctx.db.delete(tool2._id));

      await expect(
        owner.mutation(api.tools.update, {
          toolId: tool2._id,
          name: "Tent 2 updated",
          category: "camping",
          condition: "good",
          description: "Tent",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("a non-owner calling update on an already-removed tool gets NOT_FOUND", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");
      const { client: other } = await asUser(t, "other");

      const tool = await owner.mutation(api.tools.create, {
        name: "Shed Tools",
        category: "garden",
        condition: "fair",
        description: "Tools",
      });

      await owner.mutation(api.tools.remove, { toolId: tool._id });

      await expect(
        other.mutation(api.tools.update, {
          toolId: tool._id,
          name: "Hacked",
          category: "garden",
          condition: "fair",
          description: "Tools",
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });
  });

  describe("remove & active loan blocking (R5, R9)", () => {
    it("allows owner to remove tool (soft delete status removed) (R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");

      const tool = await owner.mutation(api.tools.create, {
        name: "Saw",
        category: "power_tools",
        condition: "worn",
        description: "Old saw",
      });

      await owner.mutation(api.tools.remove, { toolId: tool._id });

      const stored = await t.run(async (ctx) => ctx.db.get(tool._id));
      expect(stored?.status).toBe("removed");
    });

    it("allows admin to remove any tool without active loans (R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: user } = await asUser(t, "user");
      const { client: admin } = await asUser(t, "boss", true);

      const tool = await user.mutation(api.tools.create, {
        name: "Blower",
        category: "garden",
        condition: "fair",
        description: "Leaf blower",
      });

      await admin.mutation(api.tools.remove, { toolId: tool._id });

      const stored = await t.run(async (ctx) => ctx.db.get(tool._id));
      expect(stored?.status).toBe("removed");
    });

    it("rejects non-owner normal user with FORBIDDEN on remove (R5)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");
      const { client: other } = await asUser(t, "other");

      const tool = await owner.mutation(api.tools.create, {
        name: "Blower",
        category: "garden",
        condition: "fair",
        description: "Leaf blower",
      });

      await expect(
        other.mutation(api.tools.remove, { toolId: tool._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("throws NOT_FOUND when removing a missing, deleted, or already-removed tool", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");

      const tool = await owner.mutation(api.tools.create, {
        name: "Mop",
        category: "cleaning",
        condition: "good",
        description: "Mop",
      });

      // 1. Removing an already-removed tool throws NOT_FOUND
      await owner.mutation(api.tools.remove, { toolId: tool._id });
      await expect(
        owner.mutation(api.tools.remove, { toolId: tool._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

      // 2. Removing a deleted row throws NOT_FOUND
      const tool2 = await owner.mutation(api.tools.create, {
        name: "Mop 2",
        category: "cleaning",
        condition: "good",
        description: "Mop 2",
      });
      await t.run(async (ctx) => ctx.db.delete(tool2._id));
      await expect(
        owner.mutation(api.tools.remove, { toolId: tool2._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("a non-owner calling remove on an already-removed tool gets NOT_FOUND", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");
      const { client: other } = await asUser(t, "other");

      const tool = await owner.mutation(api.tools.create, {
        name: "Rake",
        category: "garden",
        condition: "fair",
        description: "Rake",
      });

      await owner.mutation(api.tools.remove, { toolId: tool._id });

      await expect(
        other.mutation(api.tools.remove, { toolId: tool._id })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("blocks owner and admin removal with CONFLICT if an approved unreturned loan exists (R9)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");
      const { user: borrowerUser } = await asUser(t, "borrower");
      const { client: admin } = await asUser(t, "admin", true);

      const tool = await owner.mutation(api.tools.create, {
        name: "Pressure Washer",
        category: "cleaning",
        condition: "good",
        description: "High pressure",
      });

      // Insert an approved, unreturned loan
      const loanId = await t.run(async (ctx) => {
        return await ctx.db.insert("loans", {
          toolId: tool._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      // Owner removal must be blocked with CONFLICT
      await expect(
        owner.mutation(api.tools.remove, { toolId: tool._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

      // Admin removal must ALSO be blocked with CONFLICT
      await expect(
        admin.mutation(api.tools.remove, { toolId: tool._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

      // After returnedAt is set, removal is allowed
      await t.run(async (ctx) => {
        await ctx.db.patch(loanId, { returnedAt: Date.now() });
      });

      await owner.mutation(api.tools.remove, { toolId: tool._id });

      const stored = await t.run(async (ctx) => ctx.db.get(tool._id));
      expect(stored?.status).toBe("removed");
    });

    it("non-owner removing a tool with an active loan gets FORBIDDEN, not CONFLICT", async () => {
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");
      const { user: borrowerUser } = await asUser(t, "borrower");
      const { client: stranger } = await asUser(t, "stranger");

      const tool = await owner.mutation(api.tools.create, {
        name: "Generator",
        category: "power_tools",
        condition: "new",
        description: "Generator",
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: tool._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      // Authorization check precedes loan check -> must be FORBIDDEN
      await expect(
        stranger.mutation(api.tools.remove, { toolId: tool._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("owner with tool A (active loan) and tool B (no loans): removing B succeeds, removing A gives CONFLICT (R9)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");
      const { user: borrowerUser } = await asUser(t, "borrower");

      const toolA = await owner.mutation(api.tools.create, {
        name: "Tool A with loan",
        category: "garden",
        condition: "good",
        description: "Has loan",
      });

      const toolB = await owner.mutation(api.tools.create, {
        name: "Tool B without loan",
        category: "garden",
        condition: "good",
        description: "No loan",
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolA._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      // Removing B succeeds
      await owner.mutation(api.tools.remove, { toolId: toolB._id });
      const storedB = await t.run(async (ctx) => ctx.db.get(toolB._id));
      expect(storedB?.status).toBe("removed");

      // Removing A gives CONFLICT
      await expect(
        owner.mutation(api.tools.remove, { toolId: toolA._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    });

    it("tool with returned loan AND active approved loan gives CONFLICT on remove, in both insertion orders (R9)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");
      const { user: borrowerUser } = await asUser(t, "borrower");

      // Case 1: insert "returned" first, then "approved"
      const tool1 = await owner.mutation(api.tools.create, {
        name: "Multi Loan Tool 1",
        category: "cleaning",
        condition: "good",
        description: "Tool 1",
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: tool1._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-01",
          endDate: "2026-11-05",
          status: "returned",
        });
        await ctx.db.insert("loans", {
          toolId: tool1._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      await expect(
        owner.mutation(api.tools.remove, { toolId: tool1._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

      // Case 2: insert "approved" first, then "returned"
      const tool2 = await owner.mutation(api.tools.create, {
        name: "Multi Loan Tool 2",
        category: "cleaning",
        condition: "good",
        description: "Tool 2",
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: tool2._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
        await ctx.db.insert("loans", {
          toolId: tool2._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-01",
          endDate: "2026-11-05",
          status: "returned",
        });
      });

      await expect(
        owner.mutation(api.tools.remove, { toolId: tool2._id })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    });

    it("loans in pending, declined, cancelled or returned status do NOT block removal (R9)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");
      const { user: borrowerUser } = await asUser(t, "borrower");

      for (const loanStatus of ["pending", "declined", "cancelled", "returned"] as const) {
        const tool = await owner.mutation(api.tools.create, {
          name: `Tool for ${loanStatus}`,
          category: "other",
          condition: "good",
          description: "Test tool",
        });

        await t.run(async (ctx) => {
          await ctx.db.insert("loans", {
            toolId: tool._id,
            borrowerId: borrowerUser._id,
            ownerId: ownerUser._id,
            startDate: "2026-11-10",
            endDate: "2026-11-20",
            status: loanStatus,
          });
        });

        // Removal must succeed
        await owner.mutation(api.tools.remove, { toolId: tool._id });

        const stored = await t.run(async (ctx) => ctx.db.get(tool._id));
        expect(stored?.status).toBe("removed");
      }
    });
  });

  describe("listPublic (R6)", () => {
    it("works unauthenticated, returns exactly name/category/available, excludes removed (R6)", async () => {
      const t = convexTest(schema, modules);
      const { client: owner } = await asUser(t, "owner");

      await owner.mutation(api.tools.create, {
        name: "Public Drill",
        category: "power_tools",
        condition: "new",
        description: "Super drill",
      });

      const tool2 = await owner.mutation(api.tools.create, {
        name: "Removed Drill",
        category: "power_tools",
        condition: "worn",
        description: "Broken drill",
      });
      await owner.mutation(api.tools.remove, { toolId: tool2._id });

      // Unauthenticated query
      const publicTools = await t.query(api.tools.listPublic, {});
      expect(publicTools).toHaveLength(1);

      const item = publicTools[0];
      const keys = Object.keys(item).sort();
      expect(keys).toEqual(["_id", "available", "category", "name"].sort());
      expect(item._id).toBeDefined();
      expect(item.name).toBe("Public Drill");
      expect(item.category).toBe("power_tools");
      expect(item.available).toBe(true);
    });

    it("returns at most 200 items when 201 tools are listed", async () => {
      const t = convexTest(schema, modules);
      const { user: ownerUser } = await asUser(t, "bulk_owner");

      // Insert 201 tools in database directly
      await t.run(async (ctx) => {
        for (let i = 0; i < 201; i++) {
          await ctx.db.insert("tools", {
            ownerId: ownerUser._id,
            name: `Tool ${i}`,
            category: "other",
            condition: "good",
            description: "Bulk tool",
            status: "listed",
          });
        }
      });

      const publicList = await t.query(api.tools.listPublic, {});
      expect(publicList.length).toBe(200);
    });
  });

  describe("listAll & listMine (R8)", () => {
    it("listAll returns exact projected keys, never owner email, and computes isMine (R8)", async () => {
      const t = convexTest(schema, modules);
      const { client: user1 } = await asUser(t, "user1");
      const { client: user2 } = await asUser(t, "user2");

      const t1 = await user1.mutation(api.tools.create, {
        name: "User1 Hammer",
        category: "power_tools",
        condition: "good",
        description: "U1 tool",
      });

      await user2.mutation(api.tools.create, {
        name: "User2 Tent",
        category: "camping",
        condition: "new",
        description: "U2 tool",
      });

      const allTools = await user1.query(api.tools.listAll, {});
      expect(allTools).toHaveLength(2);

      for (const item of allTools) {
        const keys = Object.keys(item).sort();
        expect(keys).toEqual(
          [
            "_id",
            "available",
            "category",
            "condition",
            "description",
            "distance",
            "isMine",
            "name",
            "ownerName",
            "ownerTrusted",
          ].sort()
        );
        expect((item as Record<string, unknown>).email).toBeUndefined();
        expect((item as Record<string, unknown>).clerkId).toBeUndefined();
        expect((item as Record<string, unknown>).ownerId).toBeUndefined();

        if (item._id === t1._id) {
          expect(item.isMine).toBe(true);
        } else {
          expect(item.isMine).toBe(false);
        }
      }
    });

    it("listAll without category excludes removed tools (R8)", async () => {
      const t = convexTest(schema, modules);
      const { client: user } = await asUser(t, "u");

      await user.mutation(api.tools.create, {
        name: "Listed Tool",
        category: "kitchen",
        condition: "good",
        description: "Listed",
      });

      const removed = await user.mutation(api.tools.create, {
        name: "Removed Tool",
        category: "kitchen",
        condition: "worn",
        description: "Removed",
      });
      await user.mutation(api.tools.remove, { toolId: removed._id });

      const allTools = await user.query(api.tools.listAll, {});
      expect(allTools).toHaveLength(1);
      expect(allTools[0].name).toBe("Listed Tool");
    });

    it("listAll with category filter returns matching tools and excludes removed tools (R8)", async () => {
      const t = convexTest(schema, modules);
      const { client: user } = await asUser(t, "u");

      await user.mutation(api.tools.create, {
        name: "Grill",
        category: "kitchen",
        condition: "good",
        description: "Grill",
      });

      const removedGrill = await user.mutation(api.tools.create, {
        name: "Broken Grill",
        category: "kitchen",
        condition: "worn",
        description: "Broken",
      });
      await user.mutation(api.tools.remove, { toolId: removedGrill._id });

      await user.mutation(api.tools.create, {
        name: "Backpack",
        category: "camping",
        condition: "new",
        description: "Backpack",
      });

      const kitchenTools = await user.query(api.tools.listAll, {
        category: "kitchen",
      });
      expect(kitchenTools).toHaveLength(1);
      expect(kitchenTools[0].name).toBe("Grill");
    });

    it("listAll returns at most 200 items when 201 tools are listed", async () => {
      const t = convexTest(schema, modules);
      const { client: user, user: ownerUser } = await asUser(t, "bulk_owner_2");

      await t.run(async (ctx) => {
        for (let i = 0; i < 201; i++) {
          await ctx.db.insert("tools", {
            ownerId: ownerUser._id,
            name: `Tool ${i}`,
            category: "other",
            condition: "good",
            description: "Bulk tool",
            status: "listed",
          });
        }
      });

      const allList = await user.query(api.tools.listAll, {});
      expect(allList.length).toBe(200);
    });

    it("listMine returns only caller's listed tools with exact same keys as listAll, excluding removed tools", async () => {
      const t = convexTest(schema, modules);
      const { client: user1 } = await asUser(t, "u1");
      const { client: user2 } = await asUser(t, "u2");

      const mine1 = await user1.mutation(api.tools.create, {
        name: "My Drill",
        category: "power_tools",
        condition: "new",
        description: "Mine",
      });

      const mine2 = await user1.mutation(api.tools.create, {
        name: "My Removed Drill",
        category: "power_tools",
        condition: "fair",
        description: "Removed",
      });
      await user1.mutation(api.tools.remove, { toolId: mine2._id });

      await user2.mutation(api.tools.create, {
        name: "Other Drill",
        category: "power_tools",
        condition: "new",
        description: "Not mine",
      });

      const myList = await user1.query(api.tools.listMine, {});
      expect(myList).toHaveLength(1);
      expect(myList[0]._id).toBe(mine1._id);
      expect(myList[0].isMine).toBe(true);

      const keys = Object.keys(myList[0]).sort();
      expect(keys).toEqual(
        [
          "_id",
          "available",
          "category",
          "condition",
          "description",
          "distance",
          "isMine",
          "name",
          "ownerName",
          "ownerTrusted",
        ].sort()
      );
    });

    it("listMine returns the listed tool when a user has 201 removed tools and 1 listed tool", async () => {
      const t = convexTest(schema, modules);
      const { client: user, user: ownerUser } = await asUser(t, "user_removed_bulk");

      await t.run(async (ctx) => {
        for (let i = 0; i < 201; i++) {
          await ctx.db.insert("tools", {
            ownerId: ownerUser._id,
            name: `Removed Tool ${i}`,
            category: "other",
            condition: "fair",
            description: "Removed bulk tool",
            status: "removed",
          });
        }
        await ctx.db.insert("tools", {
          ownerId: ownerUser._id,
          name: "Sole Listed Tool",
          category: "other",
          condition: "good",
          description: "Active tool",
          status: "listed",
        });
      });

      const myList = await user.query(api.tools.listMine, {});
      expect(myList).toHaveLength(1);
      expect(myList[0].name).toBe("Sole Listed Tool");
    });
  });

  describe("derived availability (SPEC §2) & date boundary tests", () => {
    it("today() at 2026-11-15T23:59:59Z returns '2026-11-15'", () => {
      vi.setSystemTime(new Date("2026-11-15T23:59:59Z"));
      expect(today()).toBe("2026-11-15");
    });

    it("correctly derives availability across loan dates and statuses", async () => {
      // Clock pinned to 2026-11-15T12:00:00Z by beforeEach
      const t = convexTest(schema, modules);
      const { client: owner, user: ownerUser } = await asUser(t, "owner");
      const { user: borrowerUser } = await asUser(t, "borrower");

      // 1. Tool without loans -> available: true
      await owner.mutation(api.tools.create, {
        name: "Clean Tool",
        category: "other",
        condition: "new",
        description: "No loans",
      });

      // 2. Active approved loan (startDate <= today <= endDate, unreturned) -> available: false
      const toolActive = await owner.mutation(api.tools.create, {
        name: "Active Loan Tool",
        category: "other",
        condition: "new",
        description: "Active",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolActive._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      // 3. Boundary: approved unreturned loan with startDate == today -> unavailable: false
      const toolStartToday = await owner.mutation(api.tools.create, {
        name: "Starts Today Tool",
        category: "other",
        condition: "new",
        description: "Starts today",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolStartToday._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-15",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      // 4. Boundary: approved unreturned loan with endDate == today -> unavailable: false
      const toolEndToday = await owner.mutation(api.tools.create, {
        name: "Ends Today Tool",
        category: "other",
        condition: "new",
        description: "Ends today",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolEndToday._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-15",
          status: "approved",
        });
      });

      // 5. Overdue approved loan (endDate < today, unreturned) -> stays unavailable: false
      const toolOverdue = await owner.mutation(api.tools.create, {
        name: "Overdue Tool",
        category: "other",
        condition: "new",
        description: "Overdue",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolOverdue._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-01",
          endDate: "2026-11-10",
          status: "approved",
        });
      });

      // 6. Future-dated approved loan (startDate > today) -> available: true
      const toolFuture = await owner.mutation(api.tools.create, {
        name: "Future Loan Tool",
        category: "other",
        condition: "new",
        description: "Future",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolFuture._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
          status: "approved",
        });
      });

      // 7. Approved loan that has returnedAt set -> available: true
      const toolReturnedAt = await owner.mutation(api.tools.create, {
        name: "ReturnedAt Loan Tool",
        category: "other",
        condition: "new",
        description: "ReturnedAt set",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolReturnedAt._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
          returnedAt: Date.now(),
        });
      });

      // 8. Loan with status "returned" -> available: true
      const toolStatusReturned = await owner.mutation(api.tools.create, {
        name: "Status Returned Tool",
        category: "other",
        condition: "new",
        description: "Status returned",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolStatusReturned._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "returned",
        });
      });

      // 9. Tool with returnedAt set loan AND future-dated approved loan -> available: true
      const toolReturnedAndFuture = await owner.mutation(api.tools.create, {
        name: "Returned and Future Tool",
        category: "other",
        condition: "new",
        description: "Past returned and future approved",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolReturnedAndFuture._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-01",
          endDate: "2026-11-10",
          status: "approved",
          returnedAt: Date.now(),
        });
        await ctx.db.insert("loans", {
          toolId: toolReturnedAndFuture._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-20",
          endDate: "2026-11-25",
          status: "approved",
        });
      });

      // 10. Loan with status "pending" -> available: true
      const toolPending = await owner.mutation(api.tools.create, {
        name: "Pending Loan Tool",
        category: "other",
        condition: "new",
        description: "Pending",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolPending._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "pending",
        });
      });

      // 11. Loan with status "declined" -> available: true
      const toolDeclined = await owner.mutation(api.tools.create, {
        name: "Declined Loan Tool",
        category: "other",
        condition: "new",
        description: "Declined",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolDeclined._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "declined",
        });
      });

      // 12. Loan with status "cancelled" -> available: true
      const toolCancelled = await owner.mutation(api.tools.create, {
        name: "Cancelled Loan Tool",
        category: "other",
        condition: "new",
        description: "Cancelled",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolCancelled._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "cancelled",
        });
      });

      // 13. Tool with "returned" loan AND active approved loan -> unavailable: false (test both insertion orders)
      const toolMulti1 = await owner.mutation(api.tools.create, {
        name: "Returned and Active 1",
        category: "other",
        condition: "new",
        description: "Returned then active",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolMulti1._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-01",
          endDate: "2026-11-05",
          status: "returned",
        });
        await ctx.db.insert("loans", {
          toolId: toolMulti1._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
      });

      const toolMulti2 = await owner.mutation(api.tools.create, {
        name: "Returned and Active 2",
        category: "other",
        condition: "new",
        description: "Active then returned",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("loans", {
          toolId: toolMulti2._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-10",
          endDate: "2026-11-20",
          status: "approved",
        });
        await ctx.db.insert("loans", {
          toolId: toolMulti2._id,
          borrowerId: borrowerUser._id,
          ownerId: ownerUser._id,
          startDate: "2026-11-01",
          endDate: "2026-11-05",
          status: "returned",
        });
      });

      const publicList = await t.query(api.tools.listPublic, {});
      const byName = Object.fromEntries(publicList.map((t) => [t.name, t.available]));

      expect(byName["Clean Tool"]).toBe(true);
      expect(byName["Active Loan Tool"]).toBe(false);
      expect(byName["Starts Today Tool"]).toBe(false);
      expect(byName["Ends Today Tool"]).toBe(false);
      expect(byName["Overdue Tool"]).toBe(false);
      expect(byName["Future Loan Tool"]).toBe(true);
      expect(byName["ReturnedAt Loan Tool"]).toBe(true);
      expect(byName["Status Returned Tool"]).toBe(true);
      expect(byName["Returned and Future Tool"]).toBe(true);
      expect(byName["Pending Loan Tool"]).toBe(true);
      expect(byName["Declined Loan Tool"]).toBe(true);
      expect(byName["Cancelled Loan Tool"]).toBe(true);
      expect(byName["Returned and Active 1"]).toBe(false);
      expect(byName["Returned and Active 2"]).toBe(false);
    });
  });
});

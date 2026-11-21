/// <reference types="vite/client" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { asUser } from "./helpers";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob(["../**/*.ts", "!../tests/**"]);

const PINNED_TIME = new Date("2026-11-15T12:00:00Z").getTime();

describe("admin", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("authentication and authorization guards", () => {
    it("rejects unauthenticated calls on admin.listAllLoans with UNAUTHENTICATED", async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.admin.listAllLoans, {})).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });
    });

    it("rejects unauthenticated calls on admin.setTrustedLender with UNAUTHENTICATED", async () => {
      const t = convexTest(schema, modules);
      const { user } = await asUser(t, "temp_user");
      await expect(
        t.mutation(api.admin.setTrustedLender, { userId: user._id, trusted: true })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    });

    it("rejects normal user on admin.listAllLoans with FORBIDDEN", async () => {
      const t = convexTest(schema, modules);
      const { client } = await asUser(t, "regular_user");
      await expect(client.query(api.admin.listAllLoans, {})).rejects.toMatchObject({
        data: { code: "FORBIDDEN" },
      });
    });

    it("rejects normal user on admin.setTrustedLender with FORBIDDEN", async () => {
      const t = convexTest(schema, modules);
      const { client } = await asUser(t, "regular_user");
      const { user: target } = await asUser(t, "target_user");
      await expect(
        client.mutation(api.admin.setTrustedLender, { userId: target._id, trusted: true })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("stored flag unchanged after a FORBIDDEN setTrustedLender call", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient, user: admin } = await asUser(t, "admin_flag", true);
      const { client: regularClient, user: regular } = await asUser(t, "regular_flag");

      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: regular._id,
        trusted: true,
      });

      await expect(
        regularClient.mutation(api.admin.setTrustedLender, {
          userId: regular._id,
          trusted: false,
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      const stored = await t.run(async (ctx) =>
        ctx.db.get(regular._id as Id<"users">)
      );
      expect(stored?.trustedLender).toBe(true);
    });
  });

  describe("admin.listAllLoans", () => {
    it("admin sees loans where they are not a participant", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_loans", true);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_loans");
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_loans");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Admin Saw",
        category: "power_tools",
        condition: "good",
        description: "Tool for admin test",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loan._id });

      const loans = await adminClient.query(api.admin.listAllLoans, {});
      expect(loans.length).toBeGreaterThanOrEqual(1);
      const found = loans.find((l) => l._id === loan._id);
      expect(found).toBeDefined();
    });

    it("returns exact key set with no emails or clerkIds", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_keys", true);
      const { client: ownerClient } = await asUser(t, "owner_keys");
      const { client: borrowerClient } = await asUser(t, "borrower_keys");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Keys Tool",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loan._id });

      const loans = await adminClient.query(api.admin.listAllLoans, {});
      const loanData = loans.find((l) => l._id === loan._id);
      expect(loanData).toBeDefined();

      const keys = Object.keys(loanData!).sort();
      // Sorted alphabetically
      expect(keys).toEqual([
        "_id",
        "borrowerId",
        "borrowerName",
        "endDate",
        "ownerId",
        "ownerName",
        "returnedAt",
        "startDate",
        "status",
        "toolName",
      ]);

      const json = JSON.stringify(loans);
      expect(json).not.toContain("example.com");
      expect(json).not.toContain("clerk_");
      expect(json).not.toContain("email");
      expect(json).not.toContain("clerkId");
    });

    it("orders newest first and caps at 200", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_order", true);
      const { user: owner } = await asUser(t, "owner_order");
      const { user: borrower } = await asUser(t, "borrower_order");

      // Create 201 tools and loans directly (one tool per loan to test 200 item cap)
      await t.mutation(async (ctx) => {
        for (let i = 0; i < 201; i++) {
          const toolId = await ctx.db.insert("tools", {
            ownerId: owner._id,
            name: `Order Tool ${i}`,
            category: "power_tools",
            condition: "good",
            description: "Tool",
            status: "listed",
          });

          await ctx.db.insert("loans", {
            toolId,
            borrowerId: borrower._id,
            ownerId: owner._id,
            startDate: "2026-11-20",
            endDate: "2026-11-25",
            status: "approved",
          });
        }
      });

      const loans = await adminClient.query(api.admin.listAllLoans, {});
      expect(loans.length).toBe(200);
      expect(loans[0].toolName).toBe("Order Tool 200");
    });
  });

  describe("admin.setTrustedLender", () => {
    it("sets trustedLender true then false", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_trusted", true);
      const { user: target } = await asUser(t, "target_trusted");

      let stored = await t.run(async (ctx) =>
        ctx.db.get(target._id as Id<"users">)
      );
      expect(stored?.trustedLender).toBe(false);

      const resultTrue = await adminClient.mutation(api.admin.setTrustedLender, {
        userId: target._id,
        trusted: true,
      });
      expect(resultTrue).toEqual({ userId: target._id, trustedLender: true });

      stored = await t.run(async (ctx) =>
        ctx.db.get(target._id as Id<"users">)
      );
      expect(stored?.trustedLender).toBe(true);

      const resultFalse = await adminClient.mutation(api.admin.setTrustedLender, {
        userId: target._id,
        trusted: false,
      });
      expect(resultFalse).toEqual({ userId: target._id, trustedLender: false });

      stored = await t.run(async (ctx) =>
        ctx.db.get(target._id as Id<"users">)
      );
      expect(stored?.trustedLender).toBe(false);
    });

    it("unknown user returns NOT_FOUND (real deleted id)", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_notfound", true);
      const { user: target } = await asUser(t, "target_notfound");

      await t.run(async (ctx) => ctx.db.delete(target._id));

      await expect(
        adminClient.mutation(api.admin.setTrustedLender, {
          userId: target._id,
          trusted: true,
        })
      ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    });

    it("only trustedLender changes (role, email, name unchanged)", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_onlytrusted", true);
      const { user: target } = await asUser(t, "target_onlytrusted");

      const before = await t.run(async (ctx) =>
        ctx.db.get(target._id as Id<"users">)
      );
      expect(before?.role).toBe("user");
      expect(before?.email).toBe("target_onlytrusted@example.com");
      expect(before?.name).toBe("User target_onlytrusted");

      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: target._id,
        trusted: true,
      });

      const after = await t.run(async (ctx) =>
        ctx.db.get(target._id as Id<"users">)
      );
      expect(after?.trustedLender).toBe(true);
      expect(after?.role).toBe(before?.role);
      expect(after?.email).toBe(before?.email);
      expect(after?.name).toBe(before?.name);
    });

    it("extra args rejected by the validator", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_extra", true);
      const { user: target } = await asUser(t, "target_extra");

      // Test extra arg rejection by casting to any to bypass TS type checking
      const invalidArgs = {
        userId: target._id,
        trusted: true,
        extraField: "not allowed",
      } as any;
      await expect(
        adminClient.mutation(api.admin.setTrustedLender, invalidArgs)
      ).rejects.toThrow();
    });

    it("admin may set trustedLender on themselves", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient, user: admin } = await asUser(t, "admin_self", true);

      const result = await adminClient.mutation(api.admin.setTrustedLender, {
        userId: admin._id,
        trusted: true,
      });
      expect(result).toEqual({ userId: admin._id, trustedLender: true });

      const stored = await t.run(async (ctx) =>
        ctx.db.get(admin._id as Id<"users">)
      );
      expect(stored?.trustedLender).toBe(true);
    });
  });
  describe("ownerTrusted in tool projections", () => {
    it("ownerTrusted reflects the owner's flag in tools.listAll and listMine", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_ownertrusted2", true);
      const { client: ownerClient, user: owner } = await asUser(t, "owner_ownertrusted2");

      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: owner._id,
        trusted: true,
      });

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Trusted Owner Tool",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      const allTools = await ownerClient.query(api.tools.listAll, {});
      const toolAll = allTools.find((t) => t._id === tool._id);
      expect(toolAll?.ownerTrusted).toBe(true);

      const mineTools = await ownerClient.query(api.tools.listMine, {});
      const toolMine = mineTools.find((t) => t._id === tool._id);
      expect(toolMine?.ownerTrusted).toBe(true);

      const publicTools = await ownerClient.query(api.tools.listPublic, {});
      const toolPublic = publicTools.find((t) => t.name === "Trusted Owner Tool");
      expect(toolPublic).toBeDefined();
      const publicKeys = Object.keys(toolPublic!).sort();
      expect(publicKeys).toEqual(["_id", "available", "category", "name"]);
    });

    it("(a) trusted viewer looking at untrusted owner's tool sees ownerTrusted false", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_ownertrusted_a", true);
      const { client: trustedViewerClient, user: trustedViewer } = await asUser(t, "viewer_trusted");
      const { client: untrustedOwnerClient, user: untrustedOwner } = await asUser(t, "owner_untrusted");

      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: trustedViewer._id,
        trusted: true,
      });
      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: untrustedOwner._id,
        trusted: false,
      });

      const tool = await untrustedOwnerClient.mutation(api.tools.create, {
        name: "Untrusted Owner Tool",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      const allTools = await trustedViewerClient.query(api.tools.listAll, {});
      const toolAll = allTools.find((t) => t._id === tool._id);
      expect(toolAll?.ownerTrusted).toBe(false);
    });

    it("(b) untrusted viewer looking at trusted owner's tool sees ownerTrusted true", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_ownertrusted_b", true);
      const { client: untrustedViewerClient, user: untrustedViewer } = await asUser(t, "viewer_untrusted");
      const { client: trustedOwnerClient, user: trustedOwner } = await asUser(t, "owner_trusted");

      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: untrustedViewer._id,
        trusted: false,
      });
      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: trustedOwner._id,
        trusted: true,
      });

      const tool = await trustedOwnerClient.mutation(api.tools.create, {
        name: "Trusted Owner Tool B",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      const allTools = await untrustedViewerClient.query(api.tools.listAll, {});
      const toolAll = allTools.find((t) => t._id === tool._id);
      expect(toolAll?.ownerTrusted).toBe(true);
    });

    it("(c) viewer's own tool shows viewer's own flag", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_ownertrusted_c", true);
      const { client: viewerClient, user: viewer } = await asUser(t, "viewer_own");

      await adminClient.mutation(api.admin.setTrustedLender, {
        userId: viewer._id,
        trusted: true,
      });

      const tool = await viewerClient.mutation(api.tools.create, {
        name: "Viewer Own Tool",
        category: "power_tools",
        condition: "good",
        description: "Tool",
      });

      const allTools = await viewerClient.query(api.tools.listAll, {});
      const toolAll = allTools.find((t) => t._id === tool._id);
      expect(toolAll?.ownerTrusted).toBe(true);
    });
  });

  describe("user management: suspend, restore, delete", () => {
    it("admin cannot suspend, restore, or delete their own account", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient, user: admin } = await asUser(t, "admin_self_action", true);

      await expect(
        adminClient.mutation(api.admin.suspendUser, { userId: admin._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      await expect(
        adminClient.mutation(api.admin.unsuspendUser, { userId: admin._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      await expect(
        adminClient.mutation(api.admin.deleteUser, { userId: admin._id })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("suspends user: sets status, preserves email, hides tools, cancels pending loans, and blocks protected actions", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_suspender", true);
      const { client: targetClient, user: target } = await asUser(t, "target_to_suspend");
      const { client: otherClient, user: other } = await asUser(t, "other_member");

      // Target creates a tool
      const tool = await targetClient.mutation(api.tools.create, {
        name: "Target Tool",
        category: "power_tools",
        condition: "good",
        description: "Listing to be hidden",
      });

      // Other requests a loan on target's tool
      const loan = await otherClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-22",
      });

      // Admin suspends target
      const res = await adminClient.mutation(api.admin.suspendUser, { userId: target._id });
      expect(res.status).toBe("suspended");

      const storedUser = await t.run(async (ctx) => ctx.db.get(target._id as Id<"users">));
      expect(storedUser?.status).toBe("suspended");
      expect(storedUser?.email).toBe("target_to_suspend@example.com"); // Email is NOT mangled
      expect(storedUser?.suspendedAt).toBeDefined();

      // Tool status is set to "removed"
      const storedTool = await t.run(async (ctx) => ctx.db.get(tool._id as Id<"tools">));
      expect(storedTool?.status).toBe("removed");

      // Pending loan is cancelled
      const storedLoan = await t.run(async (ctx) => ctx.db.get(loan._id as Id<"loans">));
      expect(storedLoan?.status).toBe("cancelled");

      // In-flight calls from suspended user fail immediately with ACCOUNT_SUSPENDED
      await expect(
        targetClient.mutation(api.tools.create, {
          name: "Should Fail",
          category: "garden",
          condition: "good",
          description: "Denied",
        })
      ).rejects.toMatchObject({ data: { code: "ACCOUNT_SUSPENDED" } });

      // Sign-in sync also fails with ACCOUNT_SUSPENDED
      await expect(
        targetClient.mutation(api.users.ensureUser, {})
      ).rejects.toMatchObject({ data: { code: "ACCOUNT_SUSPENDED" } });

      // Non-throwing viewer query returns status "suspended" without throwing
      const viewer = await targetClient.query(api.users.viewer, {});
      expect(viewer?.status).toBe("suspended");
    });

    it("restores suspended user and re-enables member privileges", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_restorer", true);
      const { client: targetClient, user: target } = await asUser(t, "target_to_restore");

      await adminClient.mutation(api.admin.suspendUser, { userId: target._id });

      const res = await adminClient.mutation(api.admin.unsuspendUser, { userId: target._id });
      expect(res.status).toBe("active");

      const storedUser = await t.run(async (ctx) => ctx.db.get(target._id as Id<"users">));
      expect(storedUser?.status).toBe("active");
      expect(storedUser?.suspendedAt).toBeUndefined();

      // Protected mutations succeed again
      const newTool = await targetClient.mutation(api.tools.create, {
        name: "Restored Tool",
        category: "kitchen",
        condition: "good",
        description: "Back in action",
      });
      expect(newTool.name).toBe("Restored Tool");
    });

    it("soft-deletes user: guards active loans, mangles email, scrubs PII, and allows clean re-registration", async () => {
      const t = convexTest(schema, modules);
      const { client: adminClient } = await asUser(t, "admin_deleter", true);
      const { client: borrowerClient, user: borrower } = await asUser(t, "borrower_active_loan");
      const { client: ownerClient, user: owner } = await asUser(t, "owner_active_loan");

      const tool = await ownerClient.mutation(api.tools.create, {
        name: "Active Tool",
        category: "power_tools",
        condition: "good",
        description: "In active loan",
      });

      const loan = await borrowerClient.mutation(api.loans.request, {
        toolId: tool._id,
        startDate: "2026-11-20",
        endDate: "2026-11-25",
      });
      await ownerClient.mutation(api.loans.approve, { loanId: loan._id });

      // Attempting to delete either user while loan is active fails with CONFLICT
      await expect(
        adminClient.mutation(api.admin.deleteUser, { userId: borrower._id })
      ).rejects.toMatchObject({
        data: {
          code: "CONFLICT",
        },
      });

      await expect(
        adminClient.mutation(api.admin.deleteUser, { userId: owner._id })
      ).rejects.toMatchObject({
        data: {
          code: "CONFLICT",
        },
      });

      // Mark loan returned
      await ownerClient.mutation(api.loans.markReturned, { loanId: loan._id });

      // Deleting borrower now succeeds
      const delRes = await adminClient.mutation(api.admin.deleteUser, { userId: borrower._id });
      expect(delRes.status).toBe("deleted");

      const storedBorrower = await t.run(async (ctx) => ctx.db.get(borrower._id as Id<"users">));
      expect(storedBorrower?.status).toBe("deleted");
      expect(storedBorrower?.name).toBe("Deleted User");
      expect(storedBorrower?.email).toContain("deleted_");
      expect(storedBorrower?.email).toContain("@deleted.local");

      // Suspended restore cannot be performed on deleted user
      await expect(
        adminClient.mutation(api.admin.unsuspendUser, { userId: borrower._id })
      ).rejects.toMatchObject({ data: { code: "INVALID_STATE" } });

      // Re-registering with the borrower's ORIGINAL email creates a brand new user row with a new ID
      const newClient = t.withIdentity({
        subject: "clerk_fresh_reg",
        tokenIdentifier: "clerk_fresh_reg",
        email: "borrower_active_loan@example.com",
        name: "Re-registered Borrower",
        emailVerified: true,
      });
      const newProfile = await newClient.mutation(api.users.ensureUser, {});
      expect(newProfile._id).not.toBe(borrower._id);
      expect(newProfile.email).toBe("borrower_active_loan@example.com");
      expect(newProfile.name).toBe("Re-registered Borrower");

      // In admin loan history, previous loan still renders safely with "Deleted User" as borrower
      const allLoans = await adminClient.query(api.admin.listAllLoans, {});
      const previousLoan = allLoans.find((l) => l._id === loan._id);
      expect(previousLoan?.borrowerName).toBe("Deleted User");
    });

    describe("role management: promote and demote admin", () => {
      it("admin can promote a user to admin and demote them back to user", async () => {
        const t = convexTest(schema, modules);
        const { client: adminClient } = await asUser(t, "admin_role_changer", true);
        const { user: target } = await asUser(t, "target_role_user");

        // Initially user
        const before = await t.run(async (ctx) => ctx.db.get(target._id as Id<"users">));
        expect(before?.role).toBe("user");

        // Promote to admin
        const promoteRes = await adminClient.mutation(api.admin.toggleUserRole, {
          userId: target._id,
          role: "admin",
        });
        expect(promoteRes.role).toBe("admin");

        const promoted = await t.run(async (ctx) => ctx.db.get(target._id as Id<"users">));
        expect(promoted?.role).toBe("admin");

        // Demote back to user
        const demoteRes = await adminClient.mutation(api.admin.toggleUserRole, {
          userId: target._id,
          role: "user",
        });
        expect(demoteRes.role).toBe("user");

        const demoted = await t.run(async (ctx) => ctx.db.get(target._id as Id<"users">));
        expect(demoted?.role).toBe("user");
      });

      it("admin cannot demote their own account from admin", async () => {
        const t = convexTest(schema, modules);
        const { client: adminClient, user: admin } = await asUser(t, "admin_self_demote", true);

        await expect(
          adminClient.mutation(api.admin.toggleUserRole, {
            userId: admin._id,
            role: "user",
          })
        ).rejects.toMatchObject({
          data: {
            code: "FORBIDDEN",
            message: "Cannot demote your own account from admin",
          },
        });
      });

      it("cannot change role of a suspended user", async () => {
        const t = convexTest(schema, modules);
        const { client: adminClient } = await asUser(t, "admin_role_susp", true);
        const { user: target } = await asUser(t, "target_role_susp");

        await adminClient.mutation(api.admin.suspendUser, { userId: target._id });

        await expect(
          adminClient.mutation(api.admin.toggleUserRole, {
            userId: target._id,
            role: "admin",
          })
        ).rejects.toMatchObject({
          data: {
            code: "INVALID_STATE",
            message: "Cannot change role of a suspended or deleted user.",
          },
        });
      });

      it("cannot change role of a deleted user", async () => {
        const t = convexTest(schema, modules);
        const { client: adminClient } = await asUser(t, "admin_role_del", true);
        const { user: target } = await asUser(t, "target_role_del");

        await adminClient.mutation(api.admin.deleteUser, { userId: target._id });

        await expect(
          adminClient.mutation(api.admin.toggleUserRole, {
            userId: target._id,
            role: "admin",
          })
        ).rejects.toMatchObject({
          data: {
            code: "INVALID_STATE",
            message: "Cannot change role of a suspended or deleted user.",
          },
        });
      });

      it("non-admin cannot toggle user role", async () => {
        const t = convexTest(schema, modules);
        const { client: regularClient } = await asUser(t, "regular_non_admin");
        const { user: target } = await asUser(t, "target_user_test");

        await expect(
          regularClient.mutation(api.admin.toggleUserRole, {
            userId: target._id,
            role: "admin",
          })
        ).rejects.toMatchObject({
          data: {
            code: "FORBIDDEN",
          },
        });
      });
    });
  });
});

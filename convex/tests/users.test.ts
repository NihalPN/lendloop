/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import schema from "../schema";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { requireUser, requireAdmin, requireOwner, requireOwnerOrAdmin } from "../lib/auth";

const modules = import.meta.glob(["../**/*.ts", "!../tests/**"]);

describe("users & auth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("ensureUser", () => {
    it("rejects unauthenticated calls with UNAUTHENTICATED (R1)", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.users.ensureUser, {})).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });
    });

    it("rejects an identity with no email with INVALID_INPUT and creates no row", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_no_email",
        name: "No Email User",
      });

      await expect(authed.mutation(api.users.ensureUser, {})).rejects.toMatchObject({
        data: { code: "INVALID_INPUT" },
      });

      const userCount = await t.run(async (ctx) => {
        const users = await ctx.db.query("users").collect();
        return users.length;
      });
      expect(userCount).toBe(0);
    });

    it("uses email prefix as name if identity.name is missing", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_no_name",
        email: "alice.toollover@example.com",
        emailVerified: true,
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      expect(user.name).toBe("alice.toollover");
      expect(user.email).toBe("alice.toollover@example.com");
    });

    it("truncates the name to 100 characters", async () => {
      const t = convexTest(schema, modules);
      const longName = "a".repeat(120);
      const authed = t.withIdentity({
        subject: "clerk_long_name",
        email: "longname@example.com",
        name: longName,
        emailVerified: true,
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      expect(user.name).toHaveLength(100);
      expect(user.name).toBe("a".repeat(100));
    });

    it("is idempotent: calling twice creates exactly one row (R3)", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_alice",
        email: "alice@example.com",
        name: "Alice",
        emailVerified: true,
      });

      const user1 = await authed.mutation(api.users.ensureUser, {});
      const user2 = await authed.mutation(api.users.ensureUser, {});

      expect(user1._id).toBe(user2._id);
      expect(user1.role).toBe("user");
      expect(user1.trustedLender).toBe(false);

      const allUsers = await t.run(async (ctx) => {
        return await ctx.db.query("users").collect();
      });
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].clerkId).toBe("clerk_alice");
    });

    it("returns exactly the projected keys, never clerkId (R1, SPEC §1)", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_projected",
        email: "projected@example.com",
        name: "Projected User",
        emailVerified: true,
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      const keys = Object.keys(user).sort();
      expect(keys).toEqual(["_id", "email", "name", "role", "trustedLender"].sort());
      expect((user as Record<string, unknown>).clerkId).toBeUndefined();
    });

    it("creates separate rows for different Clerk identities found by their clerkId", async () => {
      const t = convexTest(schema, modules);

      const user1 = await t
        .withIdentity({
          subject: "clerk_user_1",
          email: "user1@example.com",
          name: "User One",
          emailVerified: true,
        })
        .mutation(api.users.ensureUser, {});

      const user2 = await t
        .withIdentity({
          subject: "clerk_user_2",
          email: "user2@example.com",
          name: "User Two",
          emailVerified: true,
        })
        .mutation(api.users.ensureUser, {});

      expect(user1._id).not.toBe(user2._id);

      const [found1, found2, totalUsers] = await t.run(async (ctx) => {
        const doc1 = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", "clerk_user_1"))
          .unique();
        const doc2 = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", "clerk_user_2"))
          .unique();
        const all = await ctx.db.query("users").collect();
        return [doc1, doc2, all.length];
      });

      expect(totalUsers).toBe(2);
      expect(found1?._id).toBe(user1._id);
      expect(found2?._id).toBe(user2._id);
    });

    it("rejects role and other extra args via validator and creates no row (R1, R2)", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_attacker",
        email: "attacker@example.com",
        name: "Attacker",
        emailVerified: true,
      });

      const ensureUserWithDisallowedArgs =
        api.users.ensureUser as unknown as FunctionReference<
          "mutation",
          "public",
          Record<string, unknown>
        >;

      // Passing disallowed extra arguments must fail argument validation with specific message
      await expect(
        authed.mutation(ensureUserWithDisallowedArgs, { role: "admin" })
      ).rejects.toThrow("Validator error: Unexpected field `role` in object");

      await expect(
        authed.mutation(ensureUserWithDisallowedArgs, { userId: "custom_id" })
      ).rejects.toThrow("Validator error: Unexpected field `userId` in object");

      const userCount = await t.run(async (ctx) => {
        const users = await ctx.db.query("users").collect();
        return users.length;
      });
      expect(userCount).toBe(0);
    });

    it("seeds admin when verified email matches ADMIN_SEED_EMAIL (R3)", async () => {
      vi.stubEnv("ADMIN_SEED_EMAIL", "superadmin@example.com");
      const t = convexTest(schema, modules);

      const authed = t.withIdentity({
        subject: "clerk_superadmin",
        email: "superadmin@example.com",
        name: "Super Admin",
        emailVerified: true,
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      expect(user.role).toBe("admin");
    });

    it("seeds admin with case-insensitive and trimmed email matching (R3)", async () => {
      vi.stubEnv("ADMIN_SEED_EMAIL", "superadmin@example.com");
      const t = convexTest(schema, modules);

      const authed = t.withIdentity({
        subject: "clerk_cased_admin",
        email: "  SuperAdmin@Example.COM  ",
        name: "Cased Admin",
        emailVerified: true,
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      expect(user.role).toBe("admin");
    });

    it("does NOT seed admin if email matches but emailVerified is false (R3)", async () => {
      vi.stubEnv("ADMIN_SEED_EMAIL", "superadmin@example.com");
      const t = convexTest(schema, modules);

      const authed = t.withIdentity({
        subject: "clerk_unverified_admin",
        email: "superadmin@example.com",
        name: "Unverified Admin",
        emailVerified: false,
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      expect(user.role).toBe("user");
    });

    it("does NOT seed admin if email matches but emailVerified is absent/undefined (R3)", async () => {
      vi.stubEnv("ADMIN_SEED_EMAIL", "superadmin@example.com");
      const t = convexTest(schema, modules);

      const authed = t.withIdentity({
        subject: "clerk_no_verified_flag",
        email: "superadmin@example.com",
        name: "Admin Absent Verified",
      });

      const user = await authed.mutation(api.users.ensureUser, {});
      expect(user.role).toBe("user");
    });

    it("admin seed applies only at creation and never changes an existing user (R3)", async () => {
      // User is created first before ADMIN_SEED_EMAIL is set
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_charlie",
        email: "charlie@example.com",
        name: "Charlie",
        emailVerified: true,
      });

      const initialUser = await authed.mutation(api.users.ensureUser, {});
      expect(initialUser.role).toBe("user");

      // ADMIN_SEED_EMAIL is set afterwards to charlie's email
      vi.stubEnv("ADMIN_SEED_EMAIL", "charlie@example.com");

      // Subsequent call to ensureUser must NOT upgrade existing user to admin
      const secondCallUser = await authed.mutation(api.users.ensureUser, {});
      expect(secondCallUser.role).toBe("user");

      const storedUser = await t.run(async (ctx) => {
        return await ctx.db.get(initialUser._id as Id<"users">);
      });
      expect((storedUser as any)?.role).toBe("user");
    });
  });

  describe("auth helpers", () => {
    it("requireUser throws UNAUTHENTICATED when unauthenticated", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.run(async (ctx) => {
          return await requireUser(ctx);
        })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    });

    it("requireUser throws UNAUTHENTICATED when user row does not exist in users table", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_orphan",
        email: "orphan@example.com",
        name: "Orphan",
        emailVerified: true,
      });

      await expect(
        authed.run(async (ctx) => {
          return await requireUser(ctx);
        })
      ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
    });

    it("requireUser returns the user doc when user exists", async () => {
      const t = convexTest(schema, modules);
      const authed = t.withIdentity({
        subject: "clerk_valid",
        email: "valid@example.com",
        name: "Valid User",
        emailVerified: true,
      });

      const ensured = await authed.mutation(api.users.ensureUser, {});

      const user = await authed.run(async (ctx) => {
        return await requireUser(ctx);
      });
      expect(user._id).toBe(ensured._id);
      expect(user.clerkId).toBe("clerk_valid");
    });

    it("requireAdmin rejects normal user with FORBIDDEN and allows admin", async () => {
      const t = convexTest(schema, modules);
      const normalAuthed = t.withIdentity({
        subject: "clerk_normal",
        email: "normal@example.com",
        name: "Normal",
        emailVerified: true,
      });
      await normalAuthed.mutation(api.users.ensureUser, {});

      // Normal user rejected by requireAdmin
      await expect(
        normalAuthed.run(async (ctx) => {
          return await requireAdmin(ctx);
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      // Create admin user
      vi.stubEnv("ADMIN_SEED_EMAIL", "boss@example.com");
      const adminAuthed = t.withIdentity({
        subject: "clerk_boss",
        email: "boss@example.com",
        name: "Boss",
        emailVerified: true,
      });
      await adminAuthed.mutation(api.users.ensureUser, {});

      // Admin user accepted by requireAdmin
      const adminUser = await adminAuthed.run(async (ctx) => {
        return await requireAdmin(ctx);
      });
      expect(adminUser.role).toBe("admin");
    });

    it("requireOwner allows owner and rejects non-owner and rejects admin (admins must not pass owner-only checks)", async () => {
      const t = convexTest(schema, modules);

      // Create user 1 (owner)
      const ownerAuthed = t.withIdentity({
        subject: "clerk_owner",
        email: "owner@example.com",
        name: "Owner",
        emailVerified: true,
      });
      const owner = await ownerAuthed.mutation(api.users.ensureUser, {});

      // Create user 2 (non-owner)
      const otherAuthed = t.withIdentity({
        subject: "clerk_other",
        email: "other@example.com",
        name: "Other",
        emailVerified: true,
      });
      await otherAuthed.mutation(api.users.ensureUser, {});

      // Create user 3 (admin)
      vi.stubEnv("ADMIN_SEED_EMAIL", "boss@example.com");
      const adminAuthed = t.withIdentity({
        subject: "clerk_boss",
        email: "boss@example.com",
        name: "Boss",
        emailVerified: true,
      });
      await adminAuthed.mutation(api.users.ensureUser, {});

      // Owner passes requireOwner
      const ownerResult = await ownerAuthed.run(async (ctx) => {
        return await requireOwner(ctx, owner._id);
      });
      expect(ownerResult._id).toBe(owner._id);

      // Non-owner is rejected
      await expect(
        otherAuthed.run(async (ctx) => {
          return await requireOwner(ctx, owner._id);
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });

      // Admin who is NOT the owner is ALSO rejected (admins must not pass owner-only checks)
      await expect(
        adminAuthed.run(async (ctx) => {
          return await requireOwner(ctx, owner._id);
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });

    it("requireOwnerOrAdmin allows owner and admin, rejects other normal users", async () => {
      const t = convexTest(schema, modules);

      // Owner
      const ownerAuthed = t.withIdentity({
        subject: "clerk_owner2",
        email: "owner2@example.com",
        name: "Owner2",
        emailVerified: true,
      });
      const owner = await ownerAuthed.mutation(api.users.ensureUser, {});

      // Non-owner normal user
      const otherAuthed = t.withIdentity({
        subject: "clerk_other2",
        email: "other2@example.com",
        name: "Other2",
        emailVerified: true,
      });
      await otherAuthed.mutation(api.users.ensureUser, {});

      // Admin
      vi.stubEnv("ADMIN_SEED_EMAIL", "boss2@example.com");
      const adminAuthed = t.withIdentity({
        subject: "clerk_boss2",
        email: "boss2@example.com",
        name: "Boss2",
        emailVerified: true,
      });
      const admin = await adminAuthed.mutation(api.users.ensureUser, {});

      // Owner passes
      const ownerResult = await ownerAuthed.run(async (ctx) => {
        return await requireOwnerOrAdmin(ctx, owner._id);
      });
      expect(ownerResult._id).toBe(owner._id);

      // Admin passes even though they are not the owner
      const adminResult = await adminAuthed.run(async (ctx) => {
        return await requireOwnerOrAdmin(ctx, owner._id);
      });
      expect(adminResult._id).toBe(admin._id);

      // Normal non-owner user is rejected with FORBIDDEN
      await expect(
        otherAuthed.run(async (ctx) => {
          return await requireOwnerOrAdmin(ctx, owner._id);
        })
      ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    });
  });
});

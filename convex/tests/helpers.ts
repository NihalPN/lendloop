/// <reference types="vite/client" />
import { vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

/**
 * Helper returning an authenticated client with ensureUser already called.
 * Note: at most one admin per test because ADMIN_SEED_EMAIL is global in process.env.
 */
export async function asUser(
  t: ReturnType<typeof convexTest<typeof schema.tables>>,
  key: string,
  isAdmin = false
) {
  const email = `${key}@example.com`;
  if (isAdmin) {
    vi.stubEnv("ADMIN_SEED_EMAIL", email);
  }
  const subject = `clerk_${key}`;
  const client = t.withIdentity({
    subject,
    tokenIdentifier: subject, // Required for tokenIdentifier-based auth
    email,
    name: `User ${key}`,
    emailVerified: true,
  });
  const user = await client.mutation(api.users.ensureUser, {});
  return { client, user };
}

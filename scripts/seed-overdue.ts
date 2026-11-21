/**
 * LendLoop Overdue Loan Helper & Query Tool.
 *
 * Per SPEC.md Section 2:
 * Overdue is a derived state (never stored):
 *   status === "approved" && endDate < today (UTC) && returnedAt is unset
 *
 * This script:
 * 1. Queries the running Convex dev server (http://localhost:3211/overdue-loans) with valid HMAC signatures.
 * 2. Displays current overdue loans detected by the backend.
 * 3. Provides exact instructions and commands to seed an overdue loan into your local database.
 *
 * Usage:
 *   node scripts/seed-overdue.ts
 */
import crypto from "node:crypto";

async function main(): Promise<void> {
  const secret = process.env.N8N_API_SECRET ?? process.env.LENDLOOP_API_SECRET ?? "lendloop-api-secret";
  const baseUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:3211";
  const path = "/overdue-loans?limit=100";

  console.log("\n=======================================================");
  console.log(" LendLoop Overdue Loan Tool");
  console.log("=======================================================\n");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = `${timestamp}.GET.${path}.`;
  const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

  console.log(`Querying ${baseUrl}${path}...`);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-LL-Timestamp": timestamp,
        "X-LL-Signature": signature,
      },
    });

    if (res.ok) {
      const data = (await res.json()) as unknown;
      console.log(`[SUCCESS ${res.status}] Overdue loans returned by Convex:`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      const errText = await res.text();
      console.warn(`[HTTP ${res.status}] Response: ${errText}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[NOTICE] Could not connect to Convex at ${baseUrl}: ${message}`);
    console.log("Ensure `npx convex dev` is running locally.\n");
  }

  console.log("\n-------------------------------------------------------");
  console.log("HOW TO SEED AN OVERDUE LOAN IN LOCAL DEVELOPMENT:");
  console.log("-------------------------------------------------------");
  console.log("1. Loan dates must normally be in the future (SPEC Rule R5: startDate >= today).");
  console.log("2. To test overdue behavior in local dev:");
  console.log("   a. Sign in and create a tool listing (e.g. 'Cordless Drill').");
  console.log("   b. Request to borrow the tool from another account and approve it.");
  console.log("   c. In Convex Dashboard (Data -> loans), edit the loan document:");
  console.log("      - Set `endDate` to a past UTC date (e.g., '2026-11-01').");
  console.log("      - Ensure `status` is 'approved' and `returnedAt` is not set.");
  console.log("   d. Re-run `node scripts/seed-overdue.ts` to see it immediately detected.");
  console.log("-------------------------------------------------------\n");
}

main().catch((err: unknown) => {
  console.error("Error running script:", err);
  process.exit(1);
});

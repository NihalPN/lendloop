/**
 * CLI utility to generate HMAC-SHA256 signatures for testing Convex HTTP endpoints.
 *
 * Usage:
 *   node scripts/sign.ts <METHOD> <PATH> [JSON_BODY] [SECRET]
 *
 * Examples:
 *   node scripts/sign.ts GET /overdue-loans?limit=100
 *   node scripts/sign.ts POST /reminder-result '{"contractVersion":"v1","idempotencyKey":"test:2026-11-22","loanId":"test1234","status":"sent","channel":"email","sentAt":"2026-11-22T00:00:00Z","error":null}'
 */
import crypto from "node:crypto";

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: node scripts/sign.ts <METHOD> <PATH> [JSON_BODY] [SECRET]");
    console.log("  METHOD    : HTTP method (GET, POST)");
    console.log("  PATH      : Endpoint path including query string (e.g. /overdue-loans?limit=100)");
    console.log("  JSON_BODY : (Optional) Raw JSON string for request body (default: empty string)");
    console.log("  SECRET    : (Optional) HMAC secret (default: N8N_API_SECRET or 'lendloop-api-secret')");
    process.exit(1);
  }

  const method = (args[0] ?? "GET").toUpperCase();
  const path = args[1] ?? "/";
  const body = args[2] ?? "";
  const secret = args[3] ?? process.env.N8N_API_SECRET ?? process.env.LENDLOOP_API_SECRET ?? "lendloop-api-secret";

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = `${timestamp}.${method}.${path}.${body}`;
  const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

  const baseUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:3211";
  const fullUrl = `${baseUrl}${path}`;

  console.log("\n--- LendLoop HMAC Signature Generator ---");
  console.log(`Method    : ${method}`);
  console.log(`Path      : ${path}`);
  console.log(`Timestamp : ${timestamp}`);
  console.log(`Signature : ${signature}`);
  console.log(`Canonical : ${canonical}`);
  console.log("-----------------------------------------\n");

  if (method === "GET") {
    console.log("curl command:");
    console.log(
      `curl -s -i -X GET "${fullUrl}" \\\n  -H "X-LL-Timestamp: ${timestamp}" \\\n  -H "X-LL-Signature: ${signature}"`
    );
  } else {
    console.log("curl command:");
    console.log(
      `curl -s -i -X ${method} "${fullUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-LL-Timestamp: ${timestamp}" \\\n  -H "X-LL-Signature: ${signature}" \\\n  -d '${body}'`
    );
  }
  console.log("");
}

main();

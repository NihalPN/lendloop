/**
 * n8n Code Node: Sign Outbound HTTP Request to Convex (Contracts B & C)
 *
 * Computes HMAC-SHA256 signature for outgoing requests to Convex HTTP actions:
 * - Contract B: GET /overdue-loans?limit=100
 * - Contract C: POST /reminder-result
 *
 * Runs in n8n's Node.js sandbox (requires NODE_FUNCTION_ALLOW_BUILTIN=crypto).
 *
 * Canonical string format: {timestamp}.{METHOD}.{path}.{rawBody}
 */
const crypto = require("crypto");

// 1. Resolve shared secret from n8n environment
const secret =
  process.env.LENDLOOP_API_SECRET ||
  process.env.N8N_API_SECRET ||
  "CHANGE_ME_N8N_API_SECRET";

// 2. Generate current Unix timestamp in seconds
const timestamp = Math.floor(Date.now() / 1000).toString();

// 3. Resolve request attributes from input item
const item = $input.first().json;
const method = (item.method || "GET").toUpperCase();
const path = item.path || "/overdue-loans?limit=100";

let rawBody = "";
if (method !== "GET" && item.body) {
  rawBody = typeof item.body === "string" ? item.body : JSON.stringify(item.body);
}

// 4. Construct canonical string and compute HMAC-SHA256 hex digest
const canonical = `${timestamp}.${method}.${path}.${rawBody}`;
const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

// 5. Output request configuration with required signature headers
return [
  {
    json: {
      ...item,
      url: `${process.env.CONVEX_SITE_URL || "http://host.docker.internal:3211"}${path}`,
      headers: {
        "Content-Type": "application/json",
        "X-LL-Timestamp": timestamp,
        "X-LL-Signature": signature,
      },
      rawBody,
    },
  },
];

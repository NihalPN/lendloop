/**
 * n8n Code Node: Verify Inbound Webhook Signature (Contract A)
 *
 * Verifies HMAC-SHA256 signatures on inbound requests from Convex.
 * Runs in n8n's Node.js sandbox (requires NODE_FUNCTION_ALLOW_BUILTIN=crypto).
 *
 * Canonical string format: {timestamp}.{METHOD}.{path}.{rawBody}
 * Timing-safe comparison prevents side-channel timing attacks.
 */
const crypto = require("crypto");

// 1. Resolve shared secret from n8n environment
const secret =
  process.env.LENDLOOP_WEBHOOK_SECRET ||
  process.env.N8N_WEBHOOK_SECRET ||
  "CHANGE_ME_N8N_WEBHOOK_SECRET";

// 2. Extract headers (case-insensitive fallback)
const item = $input.first().json;
const headers = item.headers || {};
const timestampHeader =
  headers["x-ll-timestamp"] ||
  headers["x-timestamp"] ||
  headers["X-LL-Timestamp"] ||
  headers["X-Timestamp"];
const signatureHeader =
  headers["x-ll-signature"] ||
  headers["x-signature"] ||
  headers["X-LL-Signature"] ||
  headers["X-Signature"];
const eventIdHeader =
  headers["x-ll-event-id"] ||
  headers["x-event-id"] ||
  headers["X-LL-Event-Id"] ||
  headers["X-Event-Id"];

if (!timestampHeader || !signatureHeader) {
  throw new Error("Unauthorized: Missing X-LL-Timestamp or X-LL-Signature header");
}

// 3. Replay window check: reject if |now - timestamp| > 300 seconds
const ts = Number(timestampHeader);
const nowSec = Math.floor(Date.now() / 1000);
if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) {
  throw new Error("Unauthorized: Request timestamp outside 300s replay window");
}

// 4. Extract raw body (preserve exact string sent over the wire)
const rawBody =
  typeof item.rawBody === "string"
    ? item.rawBody
    : typeof item.body === "string"
      ? item.body
      : JSON.stringify(item.body || {});

// 5. Construct canonical string and compute HMAC-SHA256
const method = "POST";
const path = headers["x-forwarded-uri"] || "/webhook/lendloop-loan-events";
const canonical = `${ts}.${method}.${path}.${rawBody}`;
const computedSig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

// 6. Constant-time comparison
const sigBuffer = Buffer.from(String(signatureHeader).toLowerCase().trim(), "hex");
const compBuffer = Buffer.from(computedSig, "hex");

if (
  sigBuffer.length !== 32 ||
  compBuffer.length !== 32 ||
  !crypto.timingSafeEqual(sigBuffer, compBuffer)
) {
  throw new Error("Unauthorized: Invalid HMAC signature");
}

// 7. Parse body safely after signature verification
const parsedBody = typeof item.body === "object" ? item.body : JSON.parse(rawBody);

return [
  {
    json: {
      verified: true,
      eventId: eventIdHeader || parsedBody.eventId,
      type: parsedBody.type,
      payload: parsedBody,
    },
  },
];

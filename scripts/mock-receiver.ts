/**
 * Mock n8n Webhook Receiver for Local Testing.
 *
 * Runs a standalone HTTP server that receives outbound webhook calls from Convex,
 * verifies HMAC-SHA256 signatures according to Contract A, and logs event payloads.
 *
 * Usage:
 *   node scripts/mock-receiver.ts [PORT]
 *   (Default port: 5678)
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? process.argv[2] ?? 5678);
const SECRET =
  process.env.N8N_WEBHOOK_SECRET ??
  process.env.LENDLOOP_WEBHOOK_SECRET ??
  "lendloop-webhook-secret";

const server = http.createServer((req, res) => {
  const method = (req.method ?? "GET").toUpperCase();
  const url = req.url ?? "/";

  // Health check endpoint
  if (method === "GET" && (url === "/health" || url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "lendloop-mock-receiver" }));
    return;
  }

  // Collect request body
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf-8");

    // Extract headers (case-insensitive in Node HTTP)
    const timestampHeader =
      (req.headers["x-ll-timestamp"] as string | undefined) ??
      (req.headers["x-timestamp"] as string | undefined);
    const signatureHeader =
      (req.headers["x-ll-signature"] as string | undefined) ??
      (req.headers["x-signature"] as string | undefined);
    const eventIdHeader =
      (req.headers["x-ll-event-id"] as string | undefined) ??
      (req.headers["x-event-id"] as string | undefined);

    console.log(`\n[${new Date().toISOString()}] Inbound ${method} ${url}`);

    if (!timestampHeader || !signatureHeader) {
      console.warn("  [REJECT 401] Missing X-LL-Timestamp or X-LL-Signature header");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    // 1. Replay window check: |now - timestamp| <= 300s
    const ts = Number(timestampHeader);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) {
      console.warn(`  [REJECT 401] Timestamp ${ts} outside 300s window (now: ${nowSec})`);
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    // 2. Canonical string & HMAC computation
    const canonical = `${ts}.${method}.${url}.${rawBody}`;
    const computedSignature = crypto
      .createHmac("sha256", SECRET)
      .update(canonical)
      .digest("hex");

    const sigBuffer = Buffer.from(signatureHeader.toLowerCase().trim(), "hex");
    const compBuffer = Buffer.from(computedSignature, "hex");

    if (
      sigBuffer.length !== 32 ||
      compBuffer.length !== 32 ||
      !crypto.timingSafeEqual(sigBuffer, compBuffer)
    ) {
      console.warn("  [REJECT 401] Signature mismatch");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    // 3. Payload parsed after verification
    try {
      const parsed = JSON.parse(rawBody) as {
        type?: string;
        eventId?: string;
        loan?: { toolName?: string; startDate?: string; endDate?: string };
        recipient?: { email?: string; name?: string; role?: string };
      };

      console.log(`  [ACCEPT 200] Signature verified successfully!`);
      console.log(`    Event ID   : ${eventIdHeader ?? parsed.eventId ?? "N/A"}`);
      console.log(`    Event Type : ${parsed.type ?? "N/A"}`);
      console.log(`    Tool       : ${parsed.loan?.toolName ?? "N/A"}`);
      console.log(
        `    Dates      : ${parsed.loan?.startDate ?? "N/A"} to ${parsed.loan?.endDate ?? "N/A"}`
      );
      console.log(
        `    Recipient  : ${parsed.recipient?.name ?? "N/A"} <${parsed.recipient?.email ?? "N/A"}> (${parsed.recipient?.role ?? "N/A"})`
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    } catch {
      console.warn("  [REJECT 400] Invalid JSON body despite valid signature");
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_payload" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` LendLoop Mock Webhook Receiver`);
  console.log(` Listening on: http://localhost:${PORT}`);
  console.log(` Expected HMAC Secret: ${SECRET}`);
  console.log(` Ready to receive events at /webhook/lendloop-loan-events`);
  console.log(`======================================================\n`);
});

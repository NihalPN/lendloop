import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { ConvexError } from "convex/values";
import { verifySignature } from "./lib/hmac";
import { internal } from "./_generated/api";

const INBOUND_API_SECRET = process.env.N8N_API_SECRET;

/**
 * Verifies inbound requests from n8n using HMAC-SHA256 and Web Crypto API (crypto.subtle).
 * 1. Read x-signature and x-timestamp headers; return 401 if missing.
 * 2. Parse ts = Number(timestampStr) and reject with 401 if !Number.isFinite(ts) or |now - ts| > 300.
 * 3. Read const rawBody = await request.text() BEFORE parsing JSON.
 * 4. Reconstruct canonical = `${ts}.${request.method.toUpperCase()}.${new URL(request.url).pathname}.${rawBody}`.
 * 5. Compute HMAC-SHA256 hex via crypto.subtle using shared secret and compare in constant time; return 401 on mismatch.
 */
async function verifyN8nRequest(
  request: Request
): Promise<{ errorResponse?: Response; rawBody: string }> {
  // Support both symmetric secret and directional secrets
  const secrets = Array.from(
    new Set(
      [
        process.env.N8N_API_SECRET,
        process.env.N8N_WEBHOOK_SECRET,
        process.env.INBOUND_API_SECRET,
        INBOUND_API_SECRET,
      ].filter((s): s is string => Boolean(s))
    )
  );

  if (secrets.length === 0) {
    throw new ConvexError({
      code: "INTERNAL_ERROR",
      message: "Inbound API secret not configured",
    });
  }

  // 1. Read x-signature and x-timestamp headers (case-insensitive in Fetch API)
  const signatureHeader =
    request.headers.get("x-signature") ||
    request.headers.get("x-ll-signature");
  const timestampHeader =
    request.headers.get("x-timestamp") ||
    request.headers.get("x-ll-timestamp");

  if (!signatureHeader || !timestampHeader) {
    return {
      errorResponse: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      rawBody: "",
    };
  }

  // 2. Parse ts and reject if not finite or replay window > 300s
  const ts = Number(timestampHeader);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || ts === 0 || Math.abs(nowSec - ts) > 300) {
    return {
      errorResponse: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      rawBody: "",
    };
  }

  // 3. Read rawBody before parsing JSON
  const rawBody = await request.text();

  // 4. Reconstruct canonical string: `${ts}.${method}.${path}.${rawBody}`
  const path = new URL(request.url, "http://localhost").pathname;
  const method = request.method.toUpperCase();

  // 5. Compute HMAC-SHA256 hex via Web Crypto (crypto.subtle) and constant-time compare
  let valid = false;
  for (const secret of secrets) {
    if (
      await verifySignature(
        secret,
        signatureHeader,
        ts,
        method,
        path,
        rawBody,
        Date.now()
      )
    ) {
      valid = true;
      break;
    }
  }

  if (!valid) {
    return {
      errorResponse: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      rawBody: "",
    };
  }

  return { rawBody };
}

/**
 * GET /overdue-loans
 * Returns a list of overdue loans.
 * Requires valid HMAC signature in x-signature and x-timestamp headers.
 */
const overdueLoans = httpAction(async (ctx, request) => {
  const { errorResponse } = await verifyN8nRequest(request);
  if (errorResponse) {
    return errorResponse;
  }

  const overdue = await ctx.runQuery(internal.loans.getOverdue, {});

  return new Response(JSON.stringify(overdue), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * GET /n8n/overdue-loans
 * Returns a list of overdue loans.
 * Requires valid HMAC signature in x-signature and x-timestamp headers.
 */
const n8nOverdueLoans = httpAction(async (ctx, request) => {
  const { errorResponse } = await verifyN8nRequest(request);
  if (errorResponse) {
    return errorResponse;
  }

  const overdue = await ctx.runQuery(internal.loans.getOverdue, {});

  return new Response(JSON.stringify(overdue), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * POST /reminder-result
 * Receives the result of a reminder delivery from n8n.
 * Verifies HMAC signature and records the reminder delivery.
 */
const reminderResult = httpAction(async (ctx, request) => {
  const { errorResponse, rawBody } = await verifyN8nRequest(request);
  if (errorResponse) {
    return errorResponse;
  }

  if (!rawBody) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 6. Parse JSON body after signature verification
  let payload: { loanId: string; idempotencyKey: string; status: string };
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed.loanId || !parsed.idempotencyKey || !parsed.status) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (parsed.status !== "sent" && parsed.status !== "failed") {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    payload = parsed as {
      loanId: string;
      idempotencyKey: string;
      status: "sent" | "failed";
    };
  } catch {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Record the reminder result
  if (payload.status === "sent") {
    try {
      await ctx.runMutation(internal.automation.recordReminder, {
        loanId: payload.loanId as any,
        idempotencyKey: payload.idempotencyKey,
      });
      await ctx.runMutation(internal.loans.markReminderSent, {
        loanId: payload.loanId as any,
      });
    } catch (err: any) {
      const msg = err?.message || "";
      const isInvalidId =
        err?.data?.code === "NOT_FOUND" ||
        msg.includes("Expected ID") ||
        msg.includes("Validator error") ||
        msg.includes("Invalid ID") ||
        msg.includes("Loan not found");
      if (isInvalidId) {
        return new Response(JSON.stringify({ error: "invalid_loan_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  }

  return new Response(null, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

const router = httpRouter();
router.route({ method: "GET", path: "/overdue-loans", handler: overdueLoans });
router.route({ method: "GET", path: "/n8n/overdue-loans", handler: n8nOverdueLoans });
router.route({ method: "POST", path: "/reminder-result", handler: reminderResult });

export default router;

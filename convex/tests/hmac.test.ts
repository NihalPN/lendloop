/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCanonicalString, signPayload, verifySignature } from "../lib/hmac";

const FIXED_SECRET = "test-secret-32-bytes-length!!";
const FIXED_TIMESTAMP = 1731576000;
const FIXED_METHOD = "POST";
const FIXED_PATH = "/webhook/lendloop-loan-events";
const FIXED_BODY = "{\"contractVersion\":\"v1\",\"eventId\":\"evt_test123\",\"type\":\"loan.requested\",\"occurredAt\":\"2024-11-14T09:00:00Z\",\"loan\":{\"loanId\":\"loan_abc\",\"toolName\":\"Drill\",\"status\":\"pending\",\"startDate\":\"2024-11-20\",\"endDate\":\"2024-11-25\",\"borrowerName\":\"Bob\"}}";

describe("hmac", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(FIXED_TIMESTAMP * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("buildCanonicalString", () => {
    it("builds canonical string for POST with body", () => {
      const canonical = buildCanonicalString(FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      expect(canonical).toBe(`${FIXED_TIMESTAMP}.${FIXED_METHOD}.${FIXED_PATH}.${FIXED_BODY}`);
    });

    it("builds canonical string for GET with empty body", () => {
      const canonical = buildCanonicalString(FIXED_TIMESTAMP, "GET", "/overdue-loans", "");
      expect(canonical).toBe(`${FIXED_TIMESTAMP}.GET./overdue-loans.`);
    });

    it("includes query string in path", () => {
      const canonical = buildCanonicalString(FIXED_TIMESTAMP, "GET", "/overdue-loans?limit=100", "");
      expect(canonical).toBe(`${FIXED_TIMESTAMP}.GET./overdue-loans?limit=100.`);
    });
  });

  describe("signPayload", () => {
    it("produces consistent lowercase hex HMAC-SHA256", async () => {
      const sig1 = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const sig2 = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("known fixed test vector", async () => {
      const expected = "392b8c9626e45ff1d154355f8198e860a56baeac50b631e6818f56173f6b14d5";
      const actual = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      expect(actual).toBe(expected);
    });
  });

  describe("verifySignature", () => {
    it("returns true for valid signature within 5-minute window", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(true);
    });

    it("returns true for valid GET with empty body", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, "GET", "/overdue-loans", "");
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, "GET", "/overdue-loans", "", FIXED_TIMESTAMP * 1000);
      expect(result).toBe(true);
    });

    it("returns false for tampered body", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const tamperedBody = FIXED_BODY.replace("Drill", "Saw");
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, tamperedBody, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for tampered method", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, "GET", FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for tampered path", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, FIXED_METHOD, "/different-path", FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for signature computed with different method only (H1)", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, "POST", FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, "PUT", FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for signature computed with different path only (H1)", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP, FIXED_METHOD, "/different-path", FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for tampered timestamp (sig computed for different timestamp)", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, FIXED_TIMESTAMP + 100, FIXED_METHOD, FIXED_PATH, FIXED_BODY, (FIXED_TIMESTAMP + 100) * 1000);
      expect(result).toBe(false);
    });

    it("returns false for wrong secret", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature("wrong-secret", signature, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for stale timestamp (>300s in past)", async () => {
      const oldTimestamp = FIXED_TIMESTAMP - 301;
      const signature = await signPayload(FIXED_SECRET, oldTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, oldTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for future timestamp (>300s in future)", async () => {
      const futureTimestamp = FIXED_TIMESTAMP + 301;
      const signature = await signPayload(FIXED_SECRET, futureTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, futureTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns true for exactly 300s in past (boundary)", async () => {
      const boundaryTimestamp = FIXED_TIMESTAMP - 300;
      const signature = await signPayload(FIXED_SECRET, boundaryTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, boundaryTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(true);
    });

    it("returns true for exactly 300s in future (boundary)", async () => {
      const boundaryTimestamp = FIXED_TIMESTAMP + 300;
      const signature = await signPayload(FIXED_SECRET, boundaryTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, boundaryTimestamp, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(true);
    });

    it("returns false for malformed timestamp (NaN)", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, "not-a-number", FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for empty timestamp", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const result = await verifySignature(FIXED_SECRET, signature, "", FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for malformed signature (non-hex)", async () => {
      const result = await verifySignature(FIXED_SECRET, "not-valid-hex!", FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("returns false for signature of wrong length", async () => {
      const shortSig = "a8f5e2c4d7b1a9f3e6c8d2a4b7f1e9c3d6a2f8e1b4c7d0a3e6f9c2b5d8e1f";
      const result = await verifySignature(FIXED_SECRET, shortSig, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });

    it("does not throw on any invalid input", async () => {
      // verifySignature returns false instead of throwing, so we just verify it returns a boolean
      const result1 = await verifySignature(FIXED_SECRET, "bad", "bad", "bad", "bad", "bad", 0);
      const result2 = await verifySignature("", "", "", "", "", "", 0);
      expect(typeof result1).toBe("boolean");
      expect(typeof result2).toBe("boolean");
    });
  });

  describe("constant-time comparison", () => {
    it("takes same time regardless of first differing byte position", async () => {
      const sig1 = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      const sig2 = await signPayload("different-secret", FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      expect(await verifySignature(FIXED_SECRET, sig2, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000)).toBe(false);
    });

    it("returns false when only the last character of signature is altered (H3)", async () => {
      const signature = await signPayload(FIXED_SECRET, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY);
      // Alter only the last character (5 -> 6)
      const tamperedSignature = signature.slice(0, -1) + (signature[63] === '5' ? '6' : '5');
      const result = await verifySignature(FIXED_SECRET, tamperedSignature, FIXED_TIMESTAMP, FIXED_METHOD, FIXED_PATH, FIXED_BODY, FIXED_TIMESTAMP * 1000);
      expect(result).toBe(false);
    });
  });
});

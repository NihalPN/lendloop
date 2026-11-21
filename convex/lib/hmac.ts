/**
 * HMAC-SHA256 utilities for LendLoop Convex <-> n8n integration.
 * Uses Web Crypto API (crypto.subtle) for Convex runtime compatibility.
 * No Node.js dependencies.
 */

const HMAC_ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const SIGNATURE_BYTE_LENGTH = 32;
const SIGNATURE_HEX_LENGTH = SIGNATURE_BYTE_LENGTH * 2;
const TIMESTAMP_WINDOW_SECONDS = 300;

export function buildCanonicalString(
  timestamp: number,
  method: string,
  path: string,
  rawBody: string
): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${rawBody}`;
}

async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey("raw", keyData, HMAC_ALGORITHM, false, ["sign", "verify"]);
}

export async function signPayload(
  secret: string,
  timestamp: number,
  method: string,
  path: string,
  rawBody: string
): Promise<string> {
  const canonical = buildCanonicalString(timestamp, method, path, rawBody);
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(HMAC_ALGORITHM, key, encoder.encode(canonical));
  return bufferToHex(new Uint8Array(signature));
}

export async function verifySignature(
  secret: string,
  signatureHex: string,
  timestamp: string | number,
  method: string,
  path: string,
  rawBody: string,
  nowMs: number
): Promise<boolean> {
  const ts = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (!Number.isFinite(ts) || ts === 0) {
    return false;
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (Math.abs(nowSec - ts) > 300) {
    return false;
  }

  const normalizedSig = typeof signatureHex === "string" ? signatureHex.toLowerCase().trim() : "";
  if (normalizedSig.length !== 64 || !/^[0-9a-f]{64}$/.test(normalizedSig)) {
    return false;
  }

  const expectedHex = await signPayload(secret, ts, method, path, rawBody);
  return constantTimeEqualHex(expectedHex, normalizedSig);
}

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

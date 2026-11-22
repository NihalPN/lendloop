import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const CONVEX_BASE = process.env.CONVEX_SITE_URL || 'http://127.0.0.1:3211';
const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/lendloop-loan-events';
const SECRET =
  process.env.N8N_WEBHOOK_SECRET ||
  execSync('npx convex env get N8N_WEBHOOK_SECRET', { encoding: 'utf8' }).trim();

if (!SECRET) {
  console.error('Missing N8N_WEBHOOK_SECRET.');
  process.exit(1);
}

const sign = (ts, method, path, rawBody = '', secret = SECRET) =>
  crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${method}.${path}.${rawBody}`)
    .digest('hex');

const now = () => Math.floor(Date.now() / 1000);
const results = [];

async function check(name, fn) {
  try {
    const { ok, detail } = await fn();
    results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  } catch (err) {
    results.push({ name, status: 'FAIL', detail: err.message });
  }
}

// 1. Convex: Missing auth headers -> 401
await check('Convex GET /overdue-loans (no headers -> 401)', async () => {
  const r = await fetch(`${CONVEX_BASE}/overdue-loans`);
  return { ok: r.status === 401, detail: `HTTP ${r.status}` };
});

// 2. Convex: Invalid HMAC signature -> 401
await check('Convex GET /overdue-loans (bad signature -> 401)', async () => {
  const ts = String(now());
  const r = await fetch(`${CONVEX_BASE}/overdue-loans`, {
    headers: { 'x-timestamp': ts, 'x-signature': sign(ts, 'GET', '/overdue-loans', '', 'wrong-secret') },
  });
  return { ok: r.status === 401, detail: `HTTP ${r.status}` };
});

// 3. Convex: Replay attack (>300s old timestamp) -> 401
await check('Convex GET /overdue-loans (expired timestamp -> 401)', async () => {
  const ts = String(now() - 400);
  const r = await fetch(`${CONVEX_BASE}/overdue-loans`, {
    headers: { 'x-timestamp': ts, 'x-signature': sign(ts, 'GET', '/overdue-loans') },
  });
  return { ok: r.status === 401, detail: `HTTP ${r.status}` };
});

// 4. Convex: Cross-endpoint replay (GET signature reused on POST) -> 401
await check('Convex POST /reminder-result (method/path mismatch -> 401)', async () => {
  const ts = String(now());
  const r = await fetch(`${CONVEX_BASE}/reminder-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': ts,
      'x-signature': sign(ts, 'GET', '/overdue-loans'),
    },
    body: JSON.stringify({ loanId: 'fake', idempotencyKey: 'fake:2026-11-22', status: 'sent' }),
  });
  return { ok: r.status === 401, detail: `HTTP ${r.status}` };
});

// 5. Convex: Body tampering after signing -> 401
await check('Convex POST /reminder-result (tampered body -> 401)', async () => {
  const ts = String(now());
  const signedBody = JSON.stringify({ loanId: 'loan-a', idempotencyKey: 'loan-a:2026-11-22', status: 'sent' });
  const tamperedBody = JSON.stringify({ loanId: 'loan-b', idempotencyKey: 'loan-a:2026-11-22', status: 'sent' });
  const r = await fetch(`${CONVEX_BASE}/reminder-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': ts,
      'x-signature': sign(ts, 'POST', '/reminder-result', signedBody),
    },
    body: tamperedBody,
  });
  return { ok: r.status === 401, detail: `HTTP ${r.status}` };
});

// 6. Convex: Valid HMAC request -> 200
await check('Convex GET /overdue-loans (valid signature -> 200)', async () => {
  const ts = String(now());
  const r = await fetch(`${CONVEX_BASE}/overdue-loans`, {
    headers: { 'x-timestamp': ts, 'x-signature': sign(ts, 'GET', '/overdue-loans') },
  });
  return { ok: r.status === 200, detail: `HTTP ${r.status}` };
});

// 7. n8n Inbound Webhook: Rejects forged signature
await check('n8n POST /webhook/lendloop-loan-events (bad sig rejected)', async () => {
  const ts = String(now());
  const body = JSON.stringify({ event: 'security.test' });
  const r = await fetch(N8N_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': ts,
      'x-signature': sign(ts, 'POST', '/webhook/lendloop-loan-events', body, 'wrong-secret'),
    },
    body,
  });
  return { ok: r.status >= 400, detail: `HTTP ${r.status}` };
});

// 8. n8n Inbound Webhook: Rejects expired replay (>300s)
await check('n8n POST /webhook/lendloop-loan-events (expired ts rejected)', async () => {
  const ts = String(now() - 400);
  const body = JSON.stringify({ event: 'security.test' });
  const r = await fetch(N8N_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': ts,
      'x-signature': sign(ts, 'POST', '/webhook/lendloop-loan-events', body),
    },
    body,
  });
  return { ok: r.status >= 400, detail: `HTTP ${r.status}` };
});

console.table(results);
const failed = results.filter((r) => r.status === 'FAIL');
if (failed.length > 0) process.exit(1);
/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const convexOrigins = [];
if (process.env.NEXT_PUBLIC_CONVEX_URL) {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_CONVEX_URL);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    convexOrigins.push(u.origin, `${wsProto}//${u.host}`);
  } catch {}
}

const connectSources = Array.from(
  new Set([
    "'self'",
    "https://*.convex.cloud",
    "wss://*.convex.cloud",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.accounts.dev:*",
    "https://*.clerk.com",
    "https://*.clerk.com:*",
    "https://clerk-telemetry.com",
    ...convexOrigins,
    ...(!isProd ? ["http://127.0.0.1:3210", "ws://127.0.0.1:3210", "http://localhost:3210", "ws://localhost:3210"] : []),
  ])
).join(" ");

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com;
  font-src 'self' data:;
  connect-src ${connectSources};
  frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com;
  worker-src 'self' blob:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    const headers = [
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: cspHeader,
      },
    ];

    if (isProd) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

export default nextConfig;

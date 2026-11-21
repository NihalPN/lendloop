const rawDomain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ||
  "https://fluent-tick-4384.clerk.accounts.dev";
const domain = rawDomain
  .replace(/\/\.well-known\/jwks\.json\/?$/, "")
  .replace(/\/+$/, "");

export default {
  providers: [
    {
      domain,
      applicationID: "convex",
    },
  ],
};

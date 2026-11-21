// Validate Clerk publishable key before running middleware to prevent "Invalid URL" crashes
function isValidClerkKey(key: string | undefined): boolean {
  if (!key) return false;
  try {
    const parts = key.split("_");
    if (parts.length < 3 || parts[0] !== "pk") return false;
    const decoded = Buffer.from(parts[2], "base64").toString("utf8");
    // Valid Clerk frontend API domain ends with $ (e.g., xxx.clerk.accounts.dev$)
    // REJECT test/dev keys that have @ before the $ delimiter (e.g., xxx.clerk.accounts.dev@$)
    // These are placeholder/test keys that will cause "Invalid URL" when Clerk tries to build the handshake URL
    return /^[a-zA-Z0-9.-]+\.clerk\.accounts\.(dev|com)\$$/.test(decoded);
  } catch {
    return false;
  }
}

const isValidKey = isValidClerkKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function middleware(request: Request) {
  if (!isValidKey) {
    console.warn(
      "[Clerk] Invalid or missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — skipping clerkMiddleware to prevent crash. " +
        "Set a valid Clerk publishable key in .env.local to enable authentication."
    );
    return;
  }
  
  // Use clerkMiddleware without callback, cast request to satisfy types
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  const middleware = clerkMiddleware();
  // clerkMiddleware() returns a middleware function that expects (request, event)
  return middleware(request as any, {} as any);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

import { test, expect } from "@playwright/test";

test.describe("Public & Security Hardening", () => {
  test("security headers are strictly enforced on root response", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const headers = response.headers();

    expect(headers["content-security-policy"]).toBeDefined();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("guest homepage renders with 0 console or page errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Zero CSP violations, zero hydration errors, zero uncaught errors
    const seriousErrors = consoleErrors.filter(
      (msg) =>
        msg.includes("Content Security Policy") ||
        msg.includes("Hydration") ||
        msg.includes("Error:")
    );
    expect(seriousErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Hero headline and sign in CTA
    await expect(page.locator("text=Borrow what you need.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign In/ }).first()).toBeVisible();

    // Signup banner for logged out users
    await expect(
      page.locator("text=Create a free account to view owner details and request tools.")
    ).toBeVisible();
    await expect(page.locator("text=[ Join The Shed ]")).toBeVisible();

    // Footer navigation links always visible
    const footer = page.locator("footer");
    await expect(footer.locator('a[href="/how-it-works"]')).toBeVisible();
    await expect(footer.locator('a[href="/terms"]')).toBeVisible();
    await expect(footer.locator('a[href="/privacy"]')).toBeVisible();
  });

  for (const path of ["/how-it-works", "/terms", "/privacy"]) {
    test(`static legal/info route ${path} loads cleanly with 0 errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: Error[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => {
        pageErrors.push(err);
      });

      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await page.waitForLoadState("networkidle");

      const seriousErrors = consoleErrors.filter(
        (msg) =>
          msg.includes("Content Security Policy") ||
          msg.includes("Hydration") ||
          msg.includes("Error:")
      );
      expect(seriousErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }

  test("proxy auth redirects unauthenticated visitors away from private content", async ({ page }) => {
    // Visiting /dashboard logged out redirects to /
    await page.goto("/dashboard");
    await page.waitForURL((url) => !url.pathname.includes("/dashboard"), { timeout: 10000 });
    expect(new URL(page.url()).pathname).not.toBe("/dashboard");

    // Visiting /admin logged out redirects away (to sign-in or login)
    await page.goto("/admin");
    await page.waitForURL((url) => !url.pathname.includes("/admin"), { timeout: 10000 });
    expect(new URL(page.url()).pathname).not.toBe("/admin");
  });

  test("XSS payload in query parameter is neutralized", async ({ page }) => {
    await page.goto("/login?reason=%3Cscript%3Ewindow.__xss=1%3C/script%3E");
    await page.waitForLoadState("networkidle");

    const xssValue = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
    expect(xssValue).toBeUndefined();

    // Verify raw script tag is not injected into the DOM
    const rawScript = await page.locator("script:has-text('window.__xss=1')").count();
    expect(rawScript).toBe(0);
  });

  test("invalid tool record ID does not crash the client application", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await page.goto("/dashboard/tools/not-a-real-id");
    await page.waitForLoadState("networkidle");

    // If redirected away (because unauthenticated) or rendering 404, there must be no uncaught crash
    expect(pageErrors).toEqual([]);
  });

  test("Convex HTTP HMAC rejection: GET /overdue-loans rejects unauthenticated requests", async ({ request }) => {
    const convexHttpUrl =
      process.env.CONVEX_HTTP_URL ||
      process.env.NEXT_PUBLIC_CONVEX_URL?.replace(":3210", ":3211") ||
      "http://127.0.0.1:3211";

    // 1. Missing signature and timestamp
    const resNoAuth = await request.get(`${convexHttpUrl}/overdue-loans`);
    expect(resNoAuth.status()).toBe(401);

    // 2. Forged signature with valid timestamp
    const resForged = await request.get(`${convexHttpUrl}/overdue-loans`, {
      headers: {
        "x-signature": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "x-timestamp": String(Math.floor(Date.now() / 1000)),
      },
    });
    expect(resForged.status()).toBe(401);

    // 3. Expired timestamp (> 300s in the past)
    const resExpired = await request.get(`${convexHttpUrl}/overdue-loans`, {
      headers: {
        "x-signature": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "x-timestamp": String(Math.floor(Date.now() / 1000) - 600),
      },
    });
    expect(resExpired.status()).toBe(401);
  });
});

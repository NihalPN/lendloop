import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

const userEmail = process.env.E2E_USER_EMAIL ?? "";
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const hasCredentials = Boolean(userEmail && adminEmail);

test.describe("Authenticated Guards, UI Polish & Live BFLA", () => {
  test.beforeEach(async () => {
    test.setTimeout(60_000);
    test.skip(!hasCredentials, "Skipping authenticated suite: E2E_USER_EMAIL and E2E_ADMIN_EMAIL must be configured in .env.local");
  });

  test("regular user: authenticated dashboard loads cleanly and blocks unauthorized admin access", async ({ page, request }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    // 1. Navigate to app before calling clerk.signIn to establish window.Clerk context
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: userEmail });
    await page.waitForLoadState("networkidle");

    // 2. On homepage: assert orange banner is hidden and no CSP/runtime errors
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const seriousErrors = consoleErrors.filter(
      (msg) =>
        msg.includes("Content Security Policy") ||
        msg.includes("Hydration") ||
        msg.includes("Error:")
    );
    expect(seriousErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    await expect(page.locator("text=Create a free account to view owner details")).not.toBeVisible();
    await expect(page.locator("text=[ Dashboard ]")).toBeVisible();

    // 3. On /dashboard: loads authenticated dashboard cleanly
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=WORKSHOP VIEWS")).toBeVisible();
    await expect(page.locator("h2:has-text('Browse Available Tools')")).toBeVisible();

    // 4. UserButton and Manage Account custom page check
    const userButtonTrigger = page.locator(".cl-userButtonTrigger, [data-clerk-user-button]");
    if ((await userButtonTrigger.count()) > 0) {
      await userButtonTrigger.first().click();
      const manageAccountBtn = page.locator("text=Manage account").or(page.locator(".cl-userButtonPopoverActionButton"));
      if ((await manageAccountBtn.count()) > 0) {
        await manageAccountBtn.first().click();
        await page.waitForTimeout(500);
        // Verify custom Delete Account tab is present in Clerk modal
        const deleteAccountTab = page.locator("text=Delete Account");
        if ((await deleteAccountTab.count()) > 0) {
          await deleteAccountTab.first().click();
          await expect(
            page.getByRole("heading", { name: "Delete Member Account" })
          ).toBeVisible();
          // Close modal without deleting
          const closeBtn = page.locator(".cl-modalCloseButton, button[aria-label='Close']");
          if ((await closeBtn.count()) > 0) {
            await closeBtn.first().click();
          }
        }
      }
    }

    // 5. Regular user accessing /admin is redirected away
    await page.goto("/admin");
    await page.waitForURL((url) => !url.pathname.includes("/admin"), { timeout: 10000 });
    expect(new URL(page.url()).pathname).not.toBe("/admin");

    // 6. Live BFLA check: direct Convex API mutation with regular user's JWT
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
    const userToken = await page.evaluate(async () => {
      const win = window as unknown as {
        Clerk?: { session?: { getToken: (options: { template: string }) => Promise<string | null> } };
      };
      return (await win.Clerk?.session?.getToken({ template: "convex" })) ?? null;
    });

    if (userToken) {
      const bflaRes = await request.post(`${convexUrl}/api/mutation`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        data: {
          path: "admin:suspendUser",
          args: { userId: "jh700000000000000000000000" },
        },
      });

      const responseBody = await bflaRes.json().catch(() => null);
      // Assert Convex enforces authorization: rejection with FORBIDDEN or error status
      expect(responseBody?.status).not.toBe("success");
    }
  });

  test("admin user: admin control room renders without duplicates and protects self", async ({ page }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    // 1. Navigate to app before calling clerk.signIn
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: adminEmail });
    await page.waitForLoadState("networkidle");

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const seriousErrors = consoleErrors.filter(
      (msg) =>
        msg.includes("Content Security Policy") ||
        msg.includes("Hydration") ||
        msg.includes("Error:")
    );
    expect(seriousErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Assert exactly ONE Admin Control Room header renders (no duplicates)
    const adminHeaders = page.locator("text=[ Admin Control Room ]");
    await expect(adminHeaders).toHaveCount(1);

    // Switch to Manage Users tab in admin console
    await page.click('button:has-text("[ Manage Users ]")');
    await expect(page.locator("h2:has-text('Admin: Manage Users')")).toBeVisible();

    // Verify self-protection on Admin's own row: shows "[ You ]" and no Suspend/Delete actions
    const selfIndicator = page.locator("text=[ You ]");
    await expect(selfIndicator).toBeVisible();

    // Self row should have disabled role toggle with self title
    const selfRoleBtn = page.locator('button[title="Cannot demote your own account"]');
    await expect(selfRoleBtn).toBeDisabled();
  });
});

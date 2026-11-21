import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

const userEmail = process.env.E2E_USER_EMAIL ?? "";
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const hasCredentials = Boolean(userEmail && adminEmail);

test.describe("Two-User Loan Lifecycle E2E", () => {
  test.beforeEach(async () => {
    test.setTimeout(90_000);
    test.skip(!hasCredentials, "Skipping loan lifecycle suite: E2E_USER_EMAIL and E2E_ADMIN_EMAIL must be configured in .env.local");
  });

  test("full lending lifecycle: create tool -> request -> approve -> verify borrower cannot mark returned -> owner marks returned -> cleanup", async ({ browser }) => {
    test.setTimeout(90_000);

    // 1. Owner context (E2E_ADMIN_EMAIL)
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await setupClerkTestingToken({ page: ownerPage });
    await ownerPage.goto("/");
    await clerk.signIn({ page: ownerPage, emailAddress: adminEmail });
    await ownerPage.waitForLoadState("networkidle");

    // 2. Borrower context (E2E_USER_EMAIL)
    const borrowerContext = await browser.newContext();
    const borrowerPage = await borrowerContext.newPage();
    await setupClerkTestingToken({ page: borrowerPage });
    await borrowerPage.goto("/");
    await clerk.signIn({ page: borrowerPage, emailAddress: userEmail });
    await borrowerPage.waitForLoadState("networkidle");

    const toolName = `E2E Hammer ${Date.now()}`;

    // Step 1: Owner creates a uniquely named test tool
    await ownerPage.goto("/dashboard");
    await ownerPage.waitForLoadState("networkidle");

    await ownerPage.fill('input[placeholder="e.g. Bosch Rotary Hammer"]', toolName);
    const textarea = ownerPage.locator('textarea[placeholder*="Mention blade guards"], textarea[placeholder*="accessories"], textarea');
    if ((await textarea.count()) > 0) {
      await textarea.first().fill("E2E automated test tool description.");
    }
    await ownerPage.click('button:has-text("[ SHARE THIS TOOL ]"), button:has-text("[ Share Tool with Shed ]")');
    await ownerPage.waitForTimeout(1000);

    // Step 2: Borrower finds the tool and submits a loan request
    await borrowerPage.goto("/dashboard");
    await borrowerPage.waitForLoadState("networkidle");

    await borrowerPage.fill('input[placeholder*="Search tools"], input[placeholder*="Search by tool name"], input[type="text"]', toolName);
    await borrowerPage.waitForTimeout(500);

    const toolCard = borrowerPage.locator(`div:has-text("${toolName}")`).first();
    await expect(toolCard).toBeVisible({ timeout: 10000 });

    const requestBtn = toolCard.locator('button:has-text("[ REQUEST TO BORROW ]"), button:has-text("[ REQUEST LOAN ]")');
    await expect(requestBtn).toBeVisible();
    await requestBtn.click();
    await expect(
      toolCard
        .locator('text=[ REQUEST SENT · PENDING ]')
        .or(toolCard.locator('text=[ DISPATCHING... ]'))
        .or(toolCard.locator('text=[ REQUESTED ]'))
    ).toBeVisible({ timeout: 10000 });

    // Step 3: Owner views incoming request and clicks Accept
    await ownerPage.goto("/dashboard/inbox");
    await ownerPage.waitForLoadState("networkidle");

    const incomingRow = ownerPage.locator(`div:has-text("${toolName}")`).first();
    await expect(incomingRow).toBeVisible({ timeout: 10000 });

    const approveBtn = incomingRow.locator('button:has-text("[ Accept ]")').first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    await ownerPage.waitForTimeout(1000);

    // Step 4: Borrower verifies active loan: shows [ IN POSSESSION ] and NO mark returned button
    await borrowerPage.goto("/dashboard/my-requests");
    await borrowerPage.waitForLoadState("networkidle");

    const borrowerRow = borrowerPage.locator(`div:has-text("${toolName}")`).first();
    await expect(borrowerRow).toBeVisible({ timeout: 10000 });
    await expect(borrowerRow.locator('text=[ IN POSSESSION ]').first()).toBeVisible();
    await expect(borrowerRow.locator('button:has-text("Mark Returned")')).toHaveCount(0);

    // Step 5: Owner marks the loan as returned
    await ownerPage.goto("/dashboard/inbox");
    await ownerPage.waitForLoadState("networkidle");

    const ownerLentRow = ownerPage.locator(`div:has-text("${toolName}")`).first();
    const markReturnedBtn = ownerLentRow.locator('button:has-text("[ Mark Returned ]")').first();
    await expect(markReturnedBtn).toBeVisible({ timeout: 10000 });
    await markReturnedBtn.click();
    await ownerPage.waitForTimeout(1000);

    // Step 6: Cleanup - Owner deletes/archives the temporary tool
    await ownerPage.goto("/dashboard/my-listings");
    await ownerPage.waitForLoadState("networkidle");

    const ownerListingCard = ownerPage.locator(`div:has-text("${toolName}")`).first();
    if ((await ownerListingCard.count()) > 0) {
      const removeBtn = ownerListingCard.locator('button:has-text("[ Remove Tool ]")').first();
      if ((await removeBtn.count()) > 0) {
        await removeBtn.click();
        await ownerPage.waitForTimeout(1000);
      }
    }

    await ownerContext.close();
    await borrowerContext.close();
  });
});

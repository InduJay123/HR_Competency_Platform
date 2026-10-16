/* Uses mocked APIs only. Run against npm start on port 3107. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  let checks = 0;
  try {
    for (const platform of [false, true]) {
      const context = await browser.newContext();
      const requests = [];
      await context.route("**/api/v1/**", async route => {
        const url = new URL(route.request().url()).pathname;
        requests.push(url);
        let data = {};
        if (url.includes("auth/session")) data = { authenticated: true, csrf_token: "test", is_platform_admin: platform, company_id: "company", context: "hr", contexts: [], restricted_access: !platform, suspension_reason: "BILLING_OVERDUE", billing_access: true, user: { id: "user", first_name: "QA", last_name: "Admin", email: "qa@example.test" }, memberships: [] };
        else if (url.includes("auth/profile")) data = { first_name: "QA", last_name: "Admin" };
        else if (url.includes("platform/overview")) data = { companies: 1, active_companies: 0, pending_companies: 0, employees: 1, finalised_reviews: 0, markets: [], recent_events: [] };
        else if (url.includes("platform/companies")) data = { results: [{ id: "company", name: "QA company", active: false, suspension_reason: "BILLING_OVERDUE", people: 1, country: "Sri Lanka", created_at: "2026-01-01" }], count: 1, next: null };
        else if (url.includes("billing/current")) data = null;
        else if (url.includes("billing/history")) data = [];
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:3107/${platform ? "platform" : "hr/dashboard"}`);
      if (!platform) {
        await page.waitForURL("**/hr/billing");
        await page.getByRole("tab", { name: "Current Invoice" }).waitFor();
        assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link").count(), 2);
        assert.ok(!requests.some(url => /reports|employees|reviews|trainer/.test(url)), requests.join(","));
        await page.getByRole("link", { name: "My account", exact: true }).click();
        await page.waitForURL("**/employee/account");
        await page.getByRole("status", { name: "Company suspension notice" }).waitFor();
        checks += 3;
      } else {
        await page.getByRole("button", { name: "Change photo" }).waitFor();
        await page.getByRole("button", { name: "Companies", exact: true }).click();
        await page.getByText("Suspended", { exact: true }).waitFor();
        assert.equal(await page.getByText("Suspended", { exact: true }).evaluate(el => getComputedStyle(el).color), "rgb(138, 41, 41)");
        checks++;
      }
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow ${platform}/${width}`);
        if (platform) {
          const avatar = await page.locator(".platform-profile-avatar").boundingBox();
          const button = await page.getByRole("button", { name: "Change photo" }).boundingBox();
          assert.ok(button.y >= avatar.y + avatar.height);
          if (width === 1440) assert.ok(await page.locator(".platform-nav").evaluate(el => el.scrollHeight <= el.clientHeight + 1));
        }
        checks++;
      }
      await context.close();
    }
    console.log(`${checks} suspension and admin layout browser checks passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

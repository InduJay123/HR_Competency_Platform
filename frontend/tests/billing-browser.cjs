/* Run against a production build with mocked API responses; no live data is changed.
   BILLING_TEST_URL=http://127.0.0.1:3107 node tests/billing-browser.cjs
   Set PLAYWRIGHT_MODULE and CHROME_PATH if using an external test runtime. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  const output = path.resolve("../tmp/billing-browser");
  fs.mkdirSync(output, { recursive: true });
  let checks = 0;
  try {
    for (const platform of [false, true]) {
      const context = await browser.newContext();
      let invoice = { id: "invoice", company: "company", company_name: "QA company", billing_year: 2026, invoice_number: "QA-2026-000001", amount: "1000.00", tax_amount: "0.00", total_amount: "1000.00", currency: "LKR", issued_at: "2026-01-01", due_at: "2026-01-31", status: "AWAITING_PAYMENT", is_overdue: true, pdf_url: "/api/v1/billing/invoices/invoice/pdf/", proofs: [] };
      let proof = { id: "proof", company_name: "QA company", invoice_number: invoice.invoice_number, amount: "1000.00", currency: "LKR", submitted_by: "chief@example.test", payment_date: "2026-01-02", transaction_reference: "QA-ref", created_at: "2026-01-02T10:00:00Z", status: "PENDING", file_url: "/api/v1/billing/payment-proofs/proof/file/" };
      await context.route("**/api/v1/**", async route => {
        const url = new URL(route.request().url());
        let data = {};
        if (url.pathname.includes("auth/session")) data = { authenticated: true, csrf_token: "qa", is_platform_admin: platform, company_id: "company", context: "hr", contexts: ["employee", "hr", "manager"], user: { id: "user", first_name: "QA", last_name: "User" }, memberships: [{ company_id: "company", name: "QA company", contexts: ["hr", "manager"] }] };
        else if (url.pathname.includes("auth/profile")) data = { first_name: "QA", last_name: "User", designation: "Chief Steward" };
        else if (url.pathname.includes("platform/overview")) data = { companies: 1, active_companies: 1, pending_companies: 0, employees: 1, finalised_reviews: 0, markets: [], recent_events: [] };
        else if (url.pathname.includes("platform/companies")) data = { results: [], count: 0, next: null };
        else if (url.pathname.endsWith("/approve/")) { proof = { ...proof, status: "APPROVED" }; invoice = { ...invoice, status: "PAID", is_overdue: false }; data = proof; }
        else if (url.pathname.endsWith("/reject/")) { proof = { ...proof, status: "REJECTED", rejection_reason: "Unclear reference" }; invoice = { ...invoice, status: "AWAITING_PAYMENT" }; data = proof; }
        else if (url.pathname.includes("current/payment-proof")) { invoice = { ...invoice, status: "PAYMENT_PROOF_SUBMITTED", proofs: [proof] }; data = proof; }
        else if (url.pathname.includes("billing/current")) data = invoice;
        else if (url.pathname.includes("billing/history") || url.pathname.includes("billing/invoices")) data = [invoice];
        else if (url.pathname.includes("billing/payment-proofs")) data = [proof];
        else if (url.pathname.includes("billing/overview")) data = { total_companies: 1, invoices_issued: 1, paid: invoice.status === "PAID" ? 1 : 0, awaiting_payment: 1, proofs_awaiting_review: 1, overdue: 1 };
        else if (url.pathname.includes("billing/settings")) data = { active: false, annual_fee: null, currency: "", invoice_prefix: "", issue_month: 1, issue_day: 1, due_days: 30, tax_rate: 0 };
        else if (url.pathname.includes("trainer/status")) data = { enabled: false };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      await page.goto(`${process.env.BILLING_TEST_URL || "http://127.0.0.1:3107"}/${platform ? "platform" : "hr"}/billing`);
      await page.getByRole("tab").first().waitFor();
      const tabs = platform ? ["Overview", "Company Invoices", "Payment Proofs", "Billing Settings"] : ["Current Invoice", "Invoice History", "Upload Payment Proof"];
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const tab of tabs) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await page.getByRole("tabpanel").waitFor();
          const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
          assert.ok(dimensions.scroll <= dimensions.width + 1, `${platform ? "Admin" : "Chief"} ${tab} overflows at ${width}: ${JSON.stringify(dimensions)}`);
          checks++;
        }
        if (width === 375) await page.screenshot({ path: path.join(output, `${platform ? "admin" : "chief"}-mobile.png`), fullPage: true });
      }
      if (!platform) {
        assert.equal(await page.getByRole("link", { name: "Billing", exact: true }).count(), 1);
        await page.getByRole("tab", { name: "Upload Payment Proof" }).click();
        await page.getByLabel("Payment proof file").setInputFiles({ name: "invalid.exe", mimeType: "text/plain", buffer: Buffer.from("bad") });
        await page.getByRole("alert").filter({ hasText: "Choose a PDF" }).waitFor();
        await page.getByLabel("Payment proof file").setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-QA") });
        await page.getByLabel("Transaction/reference ID").fill("QA-ref");
        await page.getByLabel("Payment date").fill("2026-01-02");
        await page.getByRole("button", { name: "Submit Payment Proof" }).click();
        await page.getByRole("tabpanel").getByText("Payment proof submitted. Awaiting Super Admin verification.").waitFor();
        checks += 3;
      } else {
        assert.equal(await page.getByRole("button", { name: "Billing & Payments", exact: true }).count(), 1);
        await page.getByRole("tab", { name: "Payment Proofs" }).click();
        await page.getByRole("button", { name: "Approve", exact: true }).click();
        await page.getByText("Payment approved. Invoice marked paid.").waitFor();
        await page.getByRole("tabpanel").getByText("LKR 1000.00 · Approved", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Approve", exact: true }).count(), 0);
        proof = { ...proof, status: "PENDING" };
        await page.reload();
        await page.getByRole("tab", { name: "Payment Proofs" }).click();
        await page.getByLabel("Rejection reason").fill("Unclear reference");
        await page.getByRole("button", { name: "Reject", exact: true }).click();
        await page.getByText("Rejection reason: Unclear reference", { exact: true }).waitFor();
        checks += 3;
      }
      await context.close();
    }
    console.log(`${checks} browser checks passed, including 28 tab/viewport overflow checks.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

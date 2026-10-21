// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Billing, proofError } from "./billing";
import { api, post } from "@/lib/api";
import { readFileSync } from "node:fs";
vi.mock("@/lib/api", () => ({ api: vi.fn(), post: vi.fn() }));
const invoice = {
  id: "invoice",
  company: "company",
  company_name: "Example",
  billing_year: 2026,
  invoice_number: "TEST-2026-000001",
  amount: "1000",
  tax_amount: "0",
  snapshot: { billing_version: 2 },
  total_amount: "1000",
  currency: "LKR",
  issued_at: "2026-01-01",
  due_at: "2026-01-31",
  status: "AWAITING_PAYMENT",
  is_overdue: true,
  pdf_url: "/api/v1/billing/invoices/invoice/pdf/",
  proofs: [],
};
const proof = {
  id: "proof",
  company_name: "Example",
  invoice_number: invoice.invoice_number,
  currency: "LKR",
  amount: "1000",
  submitted_by: "chief@example.test",
  created_at: "2026-01-02",
  payment_date: "2026-01-02",
  transaction_reference: "ref",
  status: "PENDING",
  file_url: "/api/v1/billing/payment-proofs/proof/file/",
};
beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.includes("settings")) return { active: false, annual_fee: null };
    if (path.includes("overview")) return { total_companies: 1, paid: 0 };
    if (path.includes("payment-proofs")) return [proof];
    if (path.includes("history") || path.includes("invoices")) return [invoice];
    return invoice;
  });
  vi.mocked(post).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("automatically loads the current invoice and switches Chief Steward tabs with keyboard", async () => {
  render(<Billing />);
  expect(await screen.findByText(invoice.invoice_number)).toBeTruthy();
  expect(screen.queryByText("Tax / VAT")).toBeNull();
  expect(screen.queryByText(/Generate Invoice/i)).toBeNull();
  const current = screen.getByRole("tab", { name: "Current Invoice" });
  fireEvent.keyDown(current, { key: "ArrowRight" });
  expect(
    screen
      .getByRole("tab", { name: "Invoice History" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Upload Payment Proof" }));
  expect(screen.getByLabelText("Transaction/reference ID")).toBeTruthy();
});

it("validates files and sends proof as multipart without a company ID", async () => {
  render(<Billing />);
  await screen.findByText(invoice.invoice_number);
  fireEvent.click(screen.getByRole("tab", { name: "Upload Payment Proof" }));
  const input = screen.getByLabelText("Payment proof file");
  fireEvent.change(input, {
    target: { files: [new File(["bad"], "bad.exe", { type: "text/plain" })] },
  });
  expect(screen.getByRole("alert").textContent).toContain("Choose a PDF");
  const file = new File(["%PDF"], "proof.pdf", { type: "application/pdf" });
  // jsdom does not propagate synthetic FileLists into FormData; provide the browser result.
  const Original = globalThis.FormData;
  const form = new Original();
  form.set("file", file);
  form.set("transaction_reference", "ref");
  form.set("payment_date", "2026-01-02");
  vi.stubGlobal(
    "FormData",
    class extends Original {
      constructor() {
        super();
        for (const [k, v] of form) this.set(k, v);
      }
    },
  );
  try {
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Submit Payment Proof" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "billing/current/payment-proof/",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(form.has("company_id")).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("rejects oversized files and accepts supported formats", () => {
  for (const [name, type] of [
    ["a.pdf", "application/pdf"],
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.png", "image/png"],
  ])
    expect(proofError(new File(["content"], name, { type }))).toBe("");
  expect(
    proofError(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
        type: "application/pdf",
      }),
    ),
  ).toContain("10 MB");
});

it("shows all Super Admin tabs and refreshes after approval", async () => {
  render(<Billing platform />);
  await screen.findByText("Total companies");
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  fireEvent.click(screen.getByRole("tab", { name: "Company Invoices" }));
  expect(screen.getByText(invoice.invoice_number)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Payment Proofs" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      "platform/billing/payment-proofs/proof/approve/",
      {},
    ),
  );
  expect(
    await screen.findByText("Payment approved. Invoice marked paid."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Billing Settings" }));
  expect(await screen.findByText("Billing frequency: Yearly")).toBeTruthy();
});

it("requires a rejection reason and refreshes the verification state", async () => {
  render(<Billing platform />);
  await screen.findByText("Total companies");
  fireEvent.click(screen.getByRole("tab", { name: "Payment Proofs" }));
  expect(
    (screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Rejection reason"), {
    target: { value: "Wrong reference" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      "platform/billing/payment-proofs/proof/reject/",
      { rejection_reason: "Wrong reference" },
    ),
  );
  expect(
    await screen.findByText(/The company can submit a replacement/),
  ).toBeTruthy();
});

it("shows upload server errors", async () => {
  vi.mocked(post).mockRejectedValue(new Error("Verification unavailable"));
  render(<Billing platform />);
  await screen.findByText("Total companies");
  fireEvent.click(screen.getByRole("tab", { name: "Payment Proofs" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Verification unavailable",
  );
});

it("keeps one role-appropriate sidebar entry and responsive wrapping rules", () => {
  const shell = readFileSync("src/components/shell.tsx", "utf8");
  expect(shell).toContain('if (chief) links.push(["Billing", "/hr/billing"])');
  expect(readFileSync("src/components/platform.tsx", "utf8")).toContain(
    '"Billing & Payments"',
  );
  const css = readFileSync("src/app/billing.css", "utf8");
  expect(css).toContain("flex-wrap: wrap");
  expect(css).toContain("min-width: 0");
});

it("loads simplified settings and saves activation without removed fields", async () => {
  render(<Billing platform />);
  await screen.findByText("Total companies");
  fireEvent.click(screen.getByRole("tab", { name: "Billing Settings" }));
  for (const label of [
    "Invoice prefix",
    "Issue month",
    "Issue day",
    "Tax / VAT number",
    "Tax / VAT rate (%)",
  ])
    expect(screen.queryByLabelText(label)).toBeNull();
  expect(screen.getByRole("heading", { name: "Payment timing" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Tax" })).toBeNull();
  for (const [label, value] of [
    ["Annual default fee", "600000"],
    ["Currency", "LKR"],
    ["Legal / company name", "BTFL"],
    ["Bank name", "Bank"],
    ["Account name", "BTFL"],
    ["Account number", "123"],
    ["Payment due period (days)", "30"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByLabelText("Activate annual billing"));
  fireEvent.click(
    screen.getByRole("button", { name: "Save Billing Settings" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("platform/billing/settings/", {
      method: "PUT",
      body: JSON.stringify({
        active: true,
        annual_fee: 600000,
        currency: "LKR",
        issuer_name: "BTFL",
        bank_name: "Bank",
        bank_account_name: "BTFL",
        bank_account_number: "123",
        due_days: 30,
      }),
    }),
  );
  expect(await screen.findByText(/Billing settings saved/)).toBeTruthy();
});

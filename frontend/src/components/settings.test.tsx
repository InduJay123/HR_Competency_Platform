// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Settings } from "./settings";
import { api } from "@/lib/api";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("./shell", () => ({ useSession: () => ({ company_id: "company" }) }));
const company = {
  id: "company",
  name: "Atlas",
  tagline: "Growing",
  logo_url: "https://example.test/old.png",
  slug: "atlas",
  created_at: "2026-01-01",
};
const file = new File(["png bytes"], "new.png", { type: "image/png" });
beforeEach(() => {
  vi.mocked(api).mockResolvedValue(company);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

async function select() {
  render(<Settings />);
  fireEvent.change(await screen.findByLabelText(/Upload company logo/), {
    target: { files: [file] },
  });
  expect(api).toHaveBeenCalledTimes(1);
}

it("retains the File until Save, PATCHes fields, then uploads multipart and updates the logo", async () => {
  await select();
  vi.mocked(api)
    .mockResolvedValueOnce(company)
    .mockResolvedValueOnce({ logo_url: "/api/v1/company-logo/company/" });
  fireEvent.change(screen.getByLabelText("Company name"), {
    target: { value: "Updated Atlas" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save company details" }));
  await screen.findByText("Company details and logo saved.");
  const calls = vi.mocked(api).mock.calls;
  expect(calls[1][0]).toBe("companies/company/");
  expect(calls[1][1]?.method).toBe("PATCH");
  expect(JSON.parse(calls[1][1]?.body as string)).toMatchObject({
    name: "Updated Atlas",
    tagline: "Growing",
  });
  expect(JSON.parse(calls[1][1]?.body as string)).not.toHaveProperty("logo");
  expect(calls[2][0]).toBe("company-logo/company/");
  expect(calls[2][1]?.method).toBe("POST");
  expect((calls[2][1]?.body as FormData).get("logo")).toBe(file);
  expect(screen.queryByText("Selected logo: new.png")).toBeNull();
  expect(screen.getByRole("img").getAttribute("src")).toContain(
    "/api/v1/company-logo/company/",
  );
});

it("shows partial failure, retains the selected File and previous image, and allows retry", async () => {
  await select();
  vi.mocked(api)
    .mockResolvedValueOnce(company)
    .mockRejectedValueOnce(new Error("Storage unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Save company details" }));
  await screen.findByText(
    /Company details were saved, but the logo upload failed/,
  );
  expect(screen.getByText("Selected logo: new.png")).toBeTruthy();
  expect(screen.queryByText("Company details and logo saved.")).toBeNull();
  expect(screen.getByRole("img").getAttribute("src")).toBe(company.logo_url);
  vi.mocked(api)
    .mockResolvedValueOnce(company)
    .mockResolvedValueOnce({ logo_url: "/api/v1/company-logo/company/" });
  fireEvent.click(screen.getByRole("button", { name: "Save company details" }));
  await screen.findByText("Company details and logo saved.");
  expect((vi.mocked(api).mock.calls[4][1]?.body as FormData).get("logo")).toBe(
    file,
  );
});

it("does not upload when PATCH fails and retains the selection", async () => {
  await select();
  vi.mocked(api).mockRejectedValueOnce(new Error("Details rejected"));
  fireEvent.click(screen.getByRole("button", { name: "Save company details" }));
  await screen.findByText("Details rejected");
  expect(api).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Selected logo: new.png")).toBeTruthy();
});

it("disables Save and file selection until upload completes", async () => {
  await select();
  let finish!: (value: unknown) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(company)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  fireEvent.click(screen.getByRole("button", { name: "Save company details" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(
    (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByLabelText(/Upload company logo/) as HTMLInputElement).disabled,
  ).toBe(true);
  finish({ logo_url: "/api/v1/company-logo/company/" });
  await screen.findByText("Company details and logo saved.");
});

it("saves external logo URLs without uploading when no file is selected", async () => {
  render(<Settings />);
  await screen.findByLabelText("Company name");
  fireEvent.click(screen.getByRole("button", { name: "Save company details" }));
  await screen.findByText("Company details saved.");
  expect(api).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(vi.mocked(api).mock.calls[1][1]?.body as string).logo_url,
  ).toBe(company.logo_url);
});

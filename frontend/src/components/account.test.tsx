// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Account } from "./account";
import { api } from "@/lib/api";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
const profile = {
  first_name: "Alex",
  last_name: "Test",
  version: 1,
  photo_url: "",
  skills: "",
  bio: "",
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("keeps initials, sends a file, disables repeated uploads and refreshes the avatar", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api)
    .mockResolvedValueOnce(profile)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const listener = vi.fn();
  window.addEventListener("bfl-profile-updated", listener);
  render(<Account />);
  const input = (await screen.findByLabelText(
    "Change profile photo",
  )) as HTMLInputElement;
  expect(screen.getByText("AT")).toBeTruthy();
  const file = new File(["image"], "new.webp", { type: "image/webp" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(input.disabled).toBe(true);
  expect(screen.getByText("Uploading...")).toBeTruthy();
  const [path, options] = vi.mocked(api).mock.calls[1];
  expect(path).toBe("auth/profile/photo/");
  expect((options?.body as FormData).get("photo")).toBe(file);
  expect(options?.headers).toBeUndefined();
  finish({
    ...profile,
    version: 2,
    photo_url: "/api/v1/employees/me/photo/?v=1",
  });
  await waitFor(() =>
    expect(screen.getByAltText("Your profile").getAttribute("src")).toContain(
      "?v=1",
    ),
  );
  expect(listener).toHaveBeenCalledTimes(1);
  expect(input.disabled).toBe(false);
  window.removeEventListener("bfl-profile-updated", listener);
});

it("rejects unsupported and oversized files before requesting upload", async () => {
  vi.mocked(api).mockResolvedValue(profile);
  render(<Account />);
  const input = await screen.findByLabelText("Change profile photo");
  for (const file of [
    new File(["bad"], "x.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "x.png", {
      type: "image/png",
    }),
  ]) {
    fireEvent.change(input, { target: { files: [file] } });
  }
  expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Choose a non-empty image up to 5 MB.")).toBeTruthy();
});

it("keeps the previous picture and restores controls on storage failure", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ ...profile, photo_url: "/old.png" })
    .mockRejectedValueOnce(new Error("Storage unavailable"));
  render(<Account />);
  const input = (await screen.findByLabelText(
    "Change profile photo",
  )) as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(["png"], "x.png", { type: "image/png" })] },
  });
  expect(await screen.findByText("Storage unavailable")).toBeTruthy();
  expect(screen.getByAltText("Your profile").getAttribute("src")).toBe(
    "/old.png",
  );
  expect(input.disabled).toBe(false);
});

// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://workspace.example.test/"}
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyLogo } from "./company-logo";

const path = "/api/v1/company-logo/12345678-1234-1234-1234-123456789abc/";
const props = {
  name: "Atlas Company",
  className: "company-logo",
  width: 36,
  height: 36,
};
it("reloads a replaced logo even when its endpoint is unchanged", () => {
  render(<CompanyLogo {...props} src={path} />);
  const before = (screen.getByRole("img") as HTMLImageElement).src;
  act(() => {
    window.dispatchEvent(new Event("bfl-profile-updated"));
  });
  const after = (screen.getByRole("img") as HTMLImageElement).src;
  expect(after).not.toBe(before);
  expect(new URL(after).pathname).toBe(path);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("emits a relative image URL before hydration", () => {
  const markup = renderToStaticMarkup(
    <CompanyLogo {...props} src={`http://localhost:3000${path}`} />,
  );
  expect(markup).toContain(`src="${path}"`);
  expect(markup).not.toContain("localhost");
});

it.each([
  "http://localhost:3000",
  "http://127.0.0.1:8000",
  "https://old.example.com",
  "",
])("renders uploaded logos from the current origin instead of %s", (origin) => {
  render(<CompanyLogo {...props} src={`${origin}${path}`} />);
  const image = screen.getByRole("img");
  expect((image as HTMLImageElement).src).toBe(
    `${window.location.origin}${path}`,
  );
  expect(image.getAttribute("srcset")).toBeNull();
  expect(image.getAttribute("width")).toBe("36");
});

it("preserves cache query strings and custom external logo URLs", () => {
  const { rerender } = render(
    <CompanyLogo {...props} src={`https://old.example.com${path}?v=2`} />,
  );
  expect((screen.getByRole("img") as HTMLImageElement).src).toBe(
    `${window.location.origin}${path}?v=2`,
  );
  const external = "https://cdn.example.com/company.png";
  rerender(<CompanyLogo {...props} src={external} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe(external);
});

it("replaces a failed image with initials and retries when the source changes", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { rerender } = render(<CompanyLogo {...props} src={path} />);
  fireEvent.error(screen.getByRole("img"));
  expect(
    screen.getByRole("img", { name: "Atlas Company logo unavailable" })
      .textContent,
  ).toBe("AC");
  expect(document.querySelector("img")).toBeNull();
  expect(log).toHaveBeenCalledWith("Company logo failed to load:", path);
  rerender(<CompanyLogo {...props} src={`${path}?v=2`} />);
  expect(screen.getByRole("img").tagName).toBe("IMG");
});

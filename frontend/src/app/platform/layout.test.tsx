import { afterEach, expect, it, vi } from "vitest";
import Layout from "./layout";
import { adminOrigin } from "@/lib/portal";
vi.mock("@/lib/backend-request", () => ({
  backendRequest: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
const state = vi.hoisted(() => ({
  host: "",
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: state.host, cookie: "sessionid=test" }),
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("rejects the normal host before rendering or querying a session", async () => {
  state.host = "btflplatform.com";
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(Layout({ children: "secret" })).rejects.toThrow(
    `redirect:${adminOrigin}`,
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  { authenticated: false },
  { authenticated: true, is_platform_admin: false },
])("rejects unauthorized sessions on the server", async (session) => {
  state.host = new URL(adminOrigin).host;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => session }),
  );
  await expect(Layout({ children: "secret" })).rejects.toThrow(
    "redirect:/admin/login",
  );
});
it("renders an authorized admin and forwards the host and session to Django", async () => {
  state.host = new URL(adminOrigin).host;
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ authenticated: true, is_platform_admin: true }),
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await Layout({ children: "admin" })).toBe("admin");
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({
    Host: state.host,
    Cookie: "sessionid=test",
  });
  expect(fetcher.mock.calls[0][1].method).toBe("GET");
});
it.each([
  { authenticated: false },
  { authenticated: true, is_platform_admin: false },
])(
  "protects local platform routes with the backend session",
  async (session) => {
    state.host = "localhost:3000";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => session }),
    );
    await expect(Layout({ children: "secret" })).rejects.toThrow(
      "redirect:/admin/login",
    );
  },
);

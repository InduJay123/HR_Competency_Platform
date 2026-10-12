import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/v1/company-logo/[id]/route";

const id = "f84cac7a-e609-4b6d-8ea7-176887e9d1bb";
const context = { params: Promise.resolve({ id }) };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("uses the runtime backend and returns PNG bytes without exposing its URL", async () => {
  vi.stubEnv("BACKEND_URL", "http://backend:8000");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await GET(
    new Request(`https://workspace.example.test/api/v1/company-logo/${id}/`),
    context,
  );
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `http://backend:8000/api/v1/company-logo/${id}/`,
  );
  expect(result.headers.get("content-type")).toBe("image/png");
  expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([
    137, 80, 78, 71,
  ]);
  expect(result.headers.get("location")).toBeNull();
});

it("forwards upload bytes and existing session/CSRF headers", async () => {
  vi.stubEnv("BACKEND_URL", "http://django:8000");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ logo_url: `/api/v1/company-logo/${id}/` }),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await POST(
    new Request(`https://workspace.example.test/api/v1/company-logo/${id}/`, {
      method: "POST",
      body: "multipart bytes",
      headers: {
        cookie: "sessionid=test",
        "x-csrftoken": "csrf",
        "content-type": "multipart/form-data; boundary=test",
        origin: "https://workspace.example.test",
      },
    }),
    context,
  );
  const options = fetcher.mock.calls[0][1];
  expect(options.headers.get("cookie")).toBe("sessionid=test");
  expect(options.headers.get("x-csrftoken")).toBe("csrf");
  expect(options.headers.get("origin")).toBe("https://workspace.example.test");
  expect(new TextDecoder().decode(options.body)).toBe("multipart bytes");
  expect((await result.json()).logo_url).toBe(`/api/v1/company-logo/${id}/`);
});

it("does not fall back to loopback in production or leak internal redirects", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BACKEND_URL", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (
      await GET(
        new Request(
          `https://workspace.example.test/api/v1/company-logo/${id}/`,
        ),
        context,
      )
    ).status,
  ).toBe(502);
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("BACKEND_URL", "http://backend:8000");
  fetcher.mockResolvedValue(
    new Response(null, {
      status: 301,
      headers: { Location: "http://backend:8000/internal" },
    }),
  );
  const result = await GET(
    new Request(`https://workspace.example.test/api/v1/company-logo/${id}/`),
    context,
  );
  expect(result.status).toBe(502);
  expect(await result.text()).not.toContain("backend:8000");
});

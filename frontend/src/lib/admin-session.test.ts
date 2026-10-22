import http from "node:http";
import { expect, it } from "vitest";
import { adminSession } from "./admin-session";

it("preserves Host and cookie on real session requests, including repeated dashboard loads", async () => {
  let calls = 0;
  const server = http.createServer((request, response) => {
    calls++;
    const authorized =
      request.headers.host === "localhost:3000" &&
      request.headers.cookie === "sessionid=admin";
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        authenticated: authorized,
        is_platform_admin: authorized,
        memberships: [],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const original = process.env.BACKEND_URL;
  process.env.BACKEND_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (let i = 0; i < 2; i++) {
      expect(
        await adminSession(
          new Headers({ host: "localhost:3000", cookie: "sessionid=admin" }),
        ),
      ).toMatchObject({ authenticated: true, is_platform_admin: true });
    }
    expect(
      await adminSession(new Headers({ host: "localhost:3000" })),
    ).toMatchObject({ authenticated: false });
    expect(calls).toBe(3);
  } finally {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

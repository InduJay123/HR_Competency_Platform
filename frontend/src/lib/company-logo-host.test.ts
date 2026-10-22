import http from "node:http";
import { expect, it } from "vitest";
import { GET, POST } from "../app/api/v1/company-logo/[id]/route";

it("preserves the actual browser Host and session across a real internal HTTP connection", async () => {
  const received: {
    host?: string;
    cookie?: string;
    method?: string;
    body: string;
  }[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({
        host: request.headers.host,
        cookie: request.headers.cookie,
        method: request.method,
        body,
      });
      response.writeHead(
        request.headers.host === "localhost:3000" ? 200 : 403,
        { "Content-Type": "image/png" },
      );
      response.end("logo");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const original = process.env.BACKEND_URL;
  const address = server.address() as { port: number };
  process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`;
  try {
    const id = "f84cac7a-e609-4b6d-8ea7-176887e9d1bb";
    for (const method of ["GET", "POST"]) {
      const response = await (method === "GET" ? GET : POST)(
        new Request(`http://127.0.0.1:3000/api/v1/company-logo/${id}/`, {
          method,
          headers: { host: "localhost:3000", cookie: "sessionid=test-session" },
          ...(method === "POST" ? { body: "upload-bytes" } : {}),
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("logo");
    }
    expect(received).toEqual([
      {
        host: "localhost:3000",
        cookie: "sessionid=test-session",
        method: "GET",
        body: "",
      },
      {
        host: "localhost:3000",
        cookie: "sessionid=test-session",
        method: "POST",
        body: "upload-bytes",
      },
    ]);
  } finally {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

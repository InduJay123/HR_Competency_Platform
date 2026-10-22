import { backendRequest } from "@/lib/backend-request";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

async function proxy(request: Request, { params }: Context) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return new Response(null, { status: 404 });
  }
  // Read at request time: Docker runtime configuration must override build-time rewrites.
  const backend =
    process.env.BACKEND_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "");
  try {
    if (!backend) throw new Error("Missing backend configuration");
    const target = new URL(`/api/v1/company-logo/${id}/`, backend);
    if (!["http:", "https:"].includes(target.protocol))
      throw new Error("Invalid backend configuration");
    const headers = new Headers();
    headers.set("host", request.headers.get("host") || new URL(request.url).host);
    headers.set("x-forwarded-proto", new URL(request.url).protocol.slice(0, -1));
    for (const name of [
      "cookie",
      "content-type",
      "x-csrftoken",
      "origin",
      "referer",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const upstream = await backendRequest(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    // Never send an internal backend redirect to the browser.
    if (upstream.status >= 300 && upstream.status < 400)
      throw new Error("Unexpected backend redirect");
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "x-content-type-options", "vary"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        error: {
          details:
            "Company logo service is unavailable. Please try again later.",
        },
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;

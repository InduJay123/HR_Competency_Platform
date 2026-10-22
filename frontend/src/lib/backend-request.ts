import http from "node:http";
import https from "node:https";

// Node fetch discards a supplied Host header. Preserve the browser host when
// forwarding a host-bound Django session to an internal upstream.
export function backendRequest(
  url: URL,
  options: RequestInit,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: options.method,
        headers: Object.fromEntries(new Headers(options.headers).entries()),
      },
      (upstream) => {
        const chunks: Buffer[] = [];
        upstream.on("data", (chunk: Buffer) => chunks.push(chunk));
        upstream.on("error", reject);
        upstream.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(upstream.headers)) {
            if (value !== undefined)
              headers.set(
                name,
                Array.isArray(value) ? value.join(", ") : value,
              );
          }
          const status = upstream.statusCode || 502;
          resolve(
            new Response(
              [204, 205, 304].includes(status)
                ? null
                : new Uint8Array(Buffer.concat(chunks)),
              { status, headers },
            ),
          );
        });
      },
    );
    request.setTimeout(60000, () =>
      request.destroy(new Error("Backend request timed out")),
    );
    request.on("error", reject);
    if (options.body instanceof ArrayBuffer)
      request.write(Buffer.from(options.body));
    request.end();
  });
}

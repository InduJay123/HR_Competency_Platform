import { backendRequest } from "./backend-request";
import { adminOrigin } from "./portal";
import type { Session } from "./types";

// No cache: every server-rendered guard must validate the current cookie.
export async function adminSession(incoming: Headers): Promise<Session | null> {
  const response = await backendRequest(
    new URL(
      "/api/v1/auth/session/",
      process.env.BACKEND_URL || "http://127.0.0.1:8000",
    ),
    {
      method: "GET",
      headers: {
        Host: incoming.get("host") || "",
        Cookie: incoming.get("cookie") || "",
        "X-Forwarded-Proto": new URL(adminOrigin).protocol.slice(0, -1),
      },
    },
  );
  return response.ok ? response.json() : null;
}

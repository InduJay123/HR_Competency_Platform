import type { Session, Page } from "./types";
let csrf = "";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(errorMessage).join(" ");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${k === "detail" ? "" : `${k}: `}${errorMessage(v)}`)
      .join(" ");
  return "Unable to complete this request.";
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method || "GET";
  if (method !== "GET" && !csrf) await session();
  const response = await fetch(`/api/v1/${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(method !== "GET" ? { "X-CSRFToken": csrf } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.error?.details
        ? errorMessage(data.error.details)
        : `Request failed (${response.status}). Please try again.`,
    );
  if (data?.csrf_token) csrf = data.csrf_token;
  return data as T;
}
export const session = () => api<Session>("auth/session/");
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

// Small reference lists and source selection must never silently stop at page one.
export async function allPages<T>(path: string): Promise<T[]> {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const items: T[] = [];
  for (let page = 1; page <= 100; page++) {
    params.set("page", String(page));
    const result = await api<Page<T>>(`${route}?${params}`);
    items.push(...result.results);
    if (!result.next) return items;
  }
  throw new Error(
    "This selection is too large. Narrow the source filter before continuing.",
  );
}

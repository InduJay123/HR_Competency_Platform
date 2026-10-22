import { NextRequest, NextResponse } from "next/server";
import { portalRedirect } from "@/lib/portal";

export function proxy(request: NextRequest) {
  const destination = portalRedirect(
    request.headers.get("host") || "",
    request.nextUrl.pathname,
  );
  if (destination)
    return NextResponse.redirect(new URL(destination, request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/platform/:path*",
    "/auth/:path*",
    "/admin/:path*",
    "/employee/:path*",
    "/hr/:path*",
    "/manager/:path*",
  ],
};

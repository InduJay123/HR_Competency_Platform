"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

// Uploaded logos belong to this deployment, even when the stored URL uses an old origin.
function logoSource(source: string) {
  const match = source.match(
    /^(?:https?:\/\/[^/?#]+)?(\/api\/v1\/company-logo\/[0-9a-f-]{36}\/?)([?#].*)?$/i,
  );
  return match ? `${match[1].replace(/\/$/, "")}/${match[2] || ""}` : source;
}

export function CompanyLogo({
  src,
  name,
  className,
  width,
  height,
}: {
  src: string;
  name: string;
  className: string;
  width: number;
  height: number;
}) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("bfl-profile-updated", refresh);
    return () => window.removeEventListener("bfl-profile-updated", refresh);
  }, []);
  const normalized = logoSource(src);
  const source =
    revision && normalized.startsWith("/api/v1/company-logo/")
      ? `${normalized}${normalized.includes("?") ? "&" : "?"}refresh=${revision}`
      : normalized;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === source) {
    const initials = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    return (
      <div
        className={`${className} company-logo-fallback`}
        style={{ width, height }}
        role="img"
        aria-label={`${name} logo unavailable`}
      >
        {initials || "—"}
      </div>
    );
  }
  return (
    <Image
      className={className}
      src={source}
      width={width}
      height={height}
      unoptimized
      alt={`${name} logo`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (process.env.NODE_ENV !== "production")
          console.error("Company logo failed to load:", source);
        setFailedSource(source);
      }}
    />
  );
}

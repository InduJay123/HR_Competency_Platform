import type { ComponentPropsWithRef, ReactNode } from "react";
export function Button({
  variant = "primary",
  ...props
}: ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "neutral";
}) {
  return (
    <button
      {...props}
      className={`button ${variant} ${props.className || ""}`}
    />
  );
}
export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="alert success">
          {success}
        </p>
      )}
    </>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Loading() {
  return (
    <p role="status" className="loading">
      Loading your workspace…
    </p>
  );
}

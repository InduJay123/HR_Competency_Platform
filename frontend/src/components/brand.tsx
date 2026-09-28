export function Brand({ light = false }: { light?: boolean }) {
  return (
    <svg
      className={`btfl-brand ${light ? "brand-light" : ""}`}
      viewBox="90 750 1795 500"
      role="img"
      aria-label="Beyond the Finish Line"
    >
      <image href="/btfl-logo.png" width="2000" height="2000" />
    </svg>
  );
}

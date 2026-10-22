export function Brand({
  light = false,
  compact = false,
}: {
  light?: boolean;
  compact?: boolean;
}) {
  const primaryText = light ? "rgba(255,255,255,0.82)" : "#5f6876";

  const secondaryText = light
    ? "rgba(255,255,255,0.58)"
    : compact
      ? "#667386"
      : "#8a94a3";

  const lineColor = light ? "rgba(255,255,255,0.7)" : "#265cff";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
      <svg
        className={`btfl-brand ${light ? "brand-light" : ""}`}
        viewBox="90 750 1795 500"
        role="img"
        aria-label="Beyond the Finish Line"
      >
        <image href="/btfl-logo.png" width="2000" height="2000" />
      </svg>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          marginTop: "8px",
          maxWidth: "290px",
          fontSize: "12px",
          lineHeight: 1.5,
          letterSpacing: "0.01em",
        }}
      >
        <p
          style={{
            margin: 0,
            color: secondaryText,
          }}
        >
          <span>
            Presenting the future of leadership performance appraisal
          </span>{" "}
        </p>
      </div>
    </div>
  );
}

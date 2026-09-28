export function Loader({
  size = 14,
  speed = 0.8,
  label = "Working",
}: {
  variant?: "ascii-line";
  size?: number;
  speed?: number;
  label?: string;
}) {
  return (
    <span
      className="reasoning-loader"
      aria-label={label}
      style={{
        width: size,
        height: size,
        animationDuration: `${Math.max(0.3, speed)}s`,
      }}
    />
  );
}

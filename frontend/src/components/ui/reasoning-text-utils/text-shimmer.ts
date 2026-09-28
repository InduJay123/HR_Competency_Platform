import type { CSSProperties } from "react";
export const TEXT_SHIMMER_CLASS_NAME = "reasoning-shimmer";
export const TEXT_SHIMMER_KEYFRAMES = `@keyframes reasoning-shimmer { to { background-position: -200% center; } }`;
export function textShimmerStyle(duration: number): CSSProperties {
  return { animationDuration: `${Math.max(0.5, duration)}s` };
}

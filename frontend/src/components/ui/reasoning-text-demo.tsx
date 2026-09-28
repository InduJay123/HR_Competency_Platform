"use client";
import ReasoningText from "./reasoning-text";

/** Component-gallery example only; production chat mounts it during real requests. */
export default function ReasoningTextDemo() {
  return (
    <div
      style={{
        minHeight: 240,
        display: "grid",
        placeItems: "center",
        background: "white",
        padding: 32,
      }}
    >
      <ReasoningText />
    </div>
  );
}

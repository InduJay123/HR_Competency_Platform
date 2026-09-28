"use client";
import { useEffect, useState, type CSSProperties } from "react";
export function TextScramble({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let count = 0;
    const timer = window.setInterval(() => {
      count++;
      setFrame(count);
      if (count >= text.length) window.clearInterval(timer);
    }, 25);
    return () => window.clearInterval(timer);
  }, [text]);
  return (
    <span className={className} style={style}>
      {text
        .split("")
        .map((c, i) => (i < frame || c === " " ? c : "·"))
        .join("")}
    </span>
  );
}

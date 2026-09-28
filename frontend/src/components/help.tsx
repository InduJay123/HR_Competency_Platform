"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";

export const pillarHelp: Record<string, string> = {
  character:
    "Describe behaviours that built trust and responsibility, especially under pressure.",
  contribution:
    "Explain the difference your work made, with a specific example rather than an activity list.",
  capability:
    "Describe observable strengths, development needs and support for your present or future role.",
  context:
    "Record the conditions, constraints and support that shaped the work, and how you responded.",
  continuity:
    "Notice what others can carry forward because of your contribution: knowledge, people, systems or relationships.",
};
export function Help({ label, children }: { label: string; children: string }) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const isOpen = position !== null;
  useLayoutEffect(() => {
    if (!isOpen) return;
    function place() {
      const anchor = trigger.current?.getBoundingClientRect();
      const bubble = tooltip.current?.getBoundingClientRect();
      if (!anchor || !bubble) return;
      setPosition({
        left: Math.max(
          16,
          Math.min(anchor.left, window.innerWidth - bubble.width - 16),
        ),
        top: Math.max(
          16,
          anchor.bottom + bubble.height + 24 > window.innerHeight
            ? anchor.top - bubble.height - 8
            : anchor.bottom + 8,
        ),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen]);
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 296)),
      top: rect.bottom + 8,
    });
  }
  return (
    <span className="help-anchor" onMouseLeave={() => setPosition(null)}>
      <button
        ref={trigger}
        type="button"
        className="help-trigger"
        aria-label={`Help: ${label}`}
        aria-describedby={position ? id : undefined}
        onFocus={show}
        onMouseEnter={show}
        onClick={show}
        onBlur={() => setPosition(null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setPosition(null);
          }
        }}
      >
        ?
      </button>
      {position && (
        <span
          ref={tooltip}
          id={id}
          role="tooltip"
          className="help-tooltip"
          style={position}
        >
          {children}
        </span>
      )}
    </span>
  );
}

"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const MotionContext = createContext({ paused: false, toggle: () => {} });
export function WorkspaceMotion({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setPaused(localStorage.getItem("bfl-motion-paused") === "true");
      } catch {
        /* Optional preference storage. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function toggle() {
    const next = !paused;
    setPaused(next);
    try {
      localStorage.setItem("bfl-motion-paused", String(next));
    } catch {
      /* Motion still pauses without storage. */
    }
  }
  return (
    <MotionContext.Provider value={{ paused, toggle }}>
      <div
        className="motion-surface"
        data-motion={paused ? "paused" : "playing"}
      >
        {children}
      </div>
    </MotionContext.Provider>
  );
}
export function useWorkspaceMotion() {
  return useContext(MotionContext);
}
export function MotionToggle() {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <button
      type="button"
      className="motion-toggle"
      aria-label={
        paused ? "Resume decorative animations" : "Pause decorative animations"
      }
      aria-pressed={paused}
      onClick={toggle}
      title="Reduced motion follows your device settings"
    >
      <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>{" "}
      {paused ? "Motion paused" : "Pause motion"}
    </button>
  );
}

export function ProgressScene({ launch = false }: { launch?: boolean }) {
  return (
    <svg
      className="progress-scene"
      viewBox="0 0 160 110"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="80" cy="99" rx="60" ry="5" fill="#eaf0fa" />
      {launch ? (
        <g className="mini-launch">
          <path
            d="M80 14Q104 35 96 66L80 77L64 66Q56 35 80 14Z"
            fill="#e4edff"
            stroke="#90b4fb"
          />
          <circle cx="80" cy="43" r="10" fill="#477bf3" />
          <path d="M64 58L52 78L66 73M96 58L108 78L94 73" fill="#4275ee" />
          <path
            className="launch-flame"
            d="M73 78L80 95L87 78"
            fill="#51cfd4"
          />
        </g>
      ) : (
        <g className="mini-work">
          <rect
            x="36"
            y="16"
            width="88"
            height="77"
            rx="10"
            fill="#f4f7ff"
            stroke="#cadbfa"
          />
          <rect x="51" y="29" width="46" height="5" rx="2" fill="#bfcef0" />
          <path
            d="M68 49H108M68 65H100M68 81H92"
            stroke="#b0c4e6"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g
            className="mini-tick"
            stroke="#3e78ed"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M49 48L53 52L60 43M49 64L53 68L60 59M49 80L53 84L60 75" />
          </g>
        </g>
      )}
      <circle className="scene-spark" cx="132" cy="38" r="5" fill="#8ee0e3" />
      <path d="M21 63V73M16 68H26" stroke="#9bb8f4" strokeWidth="2" />
    </svg>
  );
}

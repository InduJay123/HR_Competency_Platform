"use client";
import { useId, type PointerEvent } from "react";

export type StewardMood = "idle" | "attentive" | "thinking" | "happy" | "error";

/** Articulated vector character: every moving part remains a live DOM element. */
export function StewardBot({ mood = "idle" }: { mood?: StewardMood }) {
  const id = useId().replace(/:/g, "");
  function look(e: PointerEvent<HTMLSpanElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty(
      "--look-x",
      `${((e.clientX - r.left) / r.width - 0.5) * 8}px`,
    );
    e.currentTarget.style.setProperty(
      "--look-y",
      `${((e.clientY - r.top) / r.height - 0.5) * 6}px`,
    );
  }
  return (
    <span
      className="steward-bot"
      data-mood={mood}
      aria-hidden="true"
      onPointerMove={look}
      onPointerLeave={(e) => {
        e.currentTarget.style.setProperty("--look-x", "0px");
        e.currentTarget.style.setProperty("--look-y", "0px");
      }}
    >
      <svg viewBox="0 0 180 202" fill="none" focusable="false">
        <defs>
          <linearGradient
            id={`${id}-shell`}
            x1="40"
            y1="35"
            x2="140"
            y2="175"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fff" />
            <stop offset=".48" stopColor="#e6ecf6" />
            <stop offset="1" stopColor="#98a9c3" />
          </linearGradient>
          <linearGradient
            id={`${id}-face`}
            x1="60"
            y1="40"
            x2="130"
            y2="110"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#193e54" />
            <stop offset="1" stopColor="#08192e" />
          </linearGradient>
          <linearGradient
            id={`${id}-light`}
            x1="70"
            y1="60"
            x2="90"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#b4ffff" />
            <stop offset="1" stopColor="#26cfe6" />
          </linearGradient>
        </defs>
        <ellipse
          className="bot-shadow"
          cx="90"
          cy="190"
          rx="33"
          ry="5"
          fill="#9ab9df"
          opacity=".22"
        />
        <g className="bot-float">
          <g className="bot-arm bot-arm-left">
            <path
              d="M54 120C38 115 20 135 21 158C22 176 35 166 41 153L59 133"
              fill={`url(#${id}-shell)`}
            />
            <path d="M29 143L38 144" stroke="#b5c8e0" strokeWidth="2" />
          </g>
          <g className="bot-arm bot-arm-right">
            <path
              d="M127 120C145 119 162 143 158 159C153 177 141 161 138 152L122 135"
              fill={`url(#${id}-shell)`}
            />
            <path d="M144 143L153 142" stroke="#b5c8e0" strokeWidth="2" />
          </g>
          <path
            d="M56 115Q90 104 125 115C147 145 126 181 91 181C59 181 37 145 56 115Z"
            fill={`url(#${id}-shell)`}
            stroke="#dce4ef"
          />
          <path d="M52 146Q88 160 128 146" stroke="#a7b8d0" strokeWidth="2" />
          <path d="M75 116V121Q90 129 105 121V115" fill="#adbed4" />
          <circle className="bot-heart" cx="90" cy="143" r="5" fill="#33d9ee" />
          <g className="bot-head">
            <path
              d="M77 27Q77 14 90 14Q103 14 104 27"
              fill={`url(#${id}-shell)`}
            />
            <rect x="23" y="54" width="22" height="41" rx="11" fill="#bac9dc" />
            <rect
              x="135"
              y="54"
              width="22"
              height="41"
              rx="11"
              fill="#bac9dc"
            />
            <rect
              x="32"
              y="26"
              width="116"
              height="90"
              rx="32"
              fill={`url(#${id}-shell)`}
              stroke="#fff"
              strokeWidth="2"
            />
            <rect
              x="41"
              y="38"
              width="98"
              height="66"
              rx="24"
              fill={`url(#${id}-face)`}
            />
            <path
              d="M44 47Q47 34 66 33"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              opacity=".8"
            />
            <g className="bot-gaze">
              <g className="bot-eyes" fill={`url(#${id}-light)`}>
                <ellipse cx="65" cy="68" rx="8" ry="10" />
                <ellipse cx="115" cy="68" rx="8" ry="10" />
              </g>
              <path
                className="bot-smile"
                d="M79 85Q90 97 102 85"
                stroke="#63ecf7"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <g className="bot-thought" fill="#63ecf7">
                <circle cx="77" cy="87" r="3" />
                <circle cx="90" cy="87" r="3" />
                <circle cx="103" cy="87" r="3" />
              </g>
            </g>
            <ellipse
              cx="53"
              cy="83"
              rx="5"
              ry="2"
              fill="#50d9ee"
              opacity=".18"
            />
            <ellipse
              cx="126"
              cy="83"
              rx="5"
              ry="2"
              fill="#50d9ee"
              opacity=".18"
            />
          </g>
        </g>
      </svg>
    </span>
  );
}

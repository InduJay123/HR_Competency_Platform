"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useWorkspaceMotion } from "./workspace-motion";

const stages = [
  {
    title: "Meaningful work",
    verb: "Align",
    description: "Connect each person’s work to a shared company outcome.",
    color: "#3479f5",
  },
  {
    title: "Real evidence",
    verb: "Reflect",
    description: "Bring results, context and learning into the conversation.",
    color: "#159caa",
  },
  {
    title: "Human review",
    verb: "Review",
    description:
      "AI supports the analysis. Your Head of HR validates the evidence.",
    color: "#7863da",
  },
  {
    title: "Lasting growth",
    verb: "Grow",
    description:
      "Agree an action, an owner and support. Put learning back into work.",
    color: "#267fbe",
  },
];
const DURATION = 5600;

function StageArt({ stage }: { stage: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {stage === 0 && (
        <>
          <circle
            className="journey-target"
            cx="47"
            cy="52"
            r="30"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity=".22"
          />
          <circle
            cx="47"
            cy="52"
            r="20"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".45"
          />
          <circle cx="47" cy="52" r="9" fill="currentColor" opacity=".12" />
          <path
            className="journey-draw"
            pathLength="1"
            d="M47 52L76 23M61 23H76V38"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle
            className="journey-arrive"
            cx="47"
            cy="52"
            r="4"
            fill="currentColor"
          />
        </>
      )}
      {stage === 1 && (
        <>
          <rect
            className="journey-paper-back"
            x="30"
            y="18"
            width="46"
            height="61"
            rx="9"
            fill="currentColor"
            opacity=".12"
            transform="rotate(9 53 48)"
          />
          <rect
            className="journey-paper"
            x="24"
            y="22"
            width="46"
            height="61"
            rx="9"
            fill="white"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M36 37H56M36 44H50"
            stroke="currentColor"
            strokeWidth="2.5"
            opacity=".3"
          />
          <path
            className="journey-draw"
            pathLength="1"
            d="M35 61L42 68L58 51"
            stroke="currentColor"
            strokeWidth="4"
          />
        </>
      )}
      {stage === 2 && (
        <>
          <path
            className="journey-paper-back"
            d="M16 25H58Q64 25 64 31V51Q64 57 58 57H30L20 66V57Q13 57 13 50V32Q13 25 16 25Z"
            fill="currentColor"
            opacity=".12"
          />
          <path
            d="M23 36H49M23 44H41"
            stroke="currentColor"
            opacity=".3"
            strokeWidth="2.5"
          />
          <circle
            className="journey-arrive"
            cx="62"
            cy="49"
            r="11"
            fill="white"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            className="journey-draw"
            pathLength="1"
            d="M42 80Q42 64 62 64Q82 64 82 80"
            stroke="currentColor"
            strokeWidth="3"
          />
          <circle cx="79" cy="30" r="10" fill="currentColor" />
          <path
            className="journey-draw"
            pathLength="1"
            d="M74 30L78 34L84 26"
            stroke="white"
            strokeWidth="2"
          />
        </>
      )}
      {stage === 3 && (
        <>
          <path
            d="M20 82Q50 76 80 82"
            stroke="currentColor"
            opacity=".25"
            strokeWidth="3"
          />
          <path
            className="journey-draw"
            pathLength="1"
            d="M50 80V37"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="journey-leaf left"
            d="M49 64Q21 65 23 42Q47 42 49 64Z"
            fill="currentColor"
            opacity=".25"
          />
          <path
            className="journey-leaf right"
            d="M51 49Q78 50 79 23Q54 23 51 49Z"
            fill="currentColor"
            opacity=".65"
          />
          <path
            className="journey-draw"
            pathLength="1"
            d="M34 53L49 65M64 37L51 50"
            stroke="white"
            strokeWidth="2"
          />
          <path
            className="journey-arrive"
            d="M25 20V28M21 24H29"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

export function PurposeJourney() {
  const { paused, toggle } = useWorkspaceMotion();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0),
    [manual, setManual] = useState(false),
    [visible, setVisible] = useState(true),
    [tabVisible, setTabVisible] = useState(true),
    [engaged, setEngaged] = useState(false);
  const root = useRef<HTMLElement>(null);
  const descriptionId = useId();
  const running =
    !paused &&
    reduced === false &&
    !manual &&
    visible &&
    tabVisible &&
    !engaged;
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    if (root.current) observer.observe(root.current);
    const visibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setStep((previous) => (previous + 1) % stages.length),
      DURATION,
    );
    return () => window.clearInterval(timer);
  }, [running]);
  function choose(index: number) {
    setStep(index);
    setManual(true);
  }
  function play() {
    setEngaged(false);
    if (paused) {
      toggle();
      setManual(false);
    } else setManual((value) => !value);
  }
  return (
    <section
      ref={root}
      className="purpose-journey"
      aria-label="Explore the stewardship journey"
      data-running={running}
      data-still={paused || !!reduced}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setEngaged(false);
      }}
    >
      <div className="journey-eyebrow">
        <span /> THE STEWARDSHIP JOURNEY
      </div>
      <div
        className="journey-stage"
        style={{ "--journey-color": stages[step].color } as React.CSSProperties}
      >
        <div className="journey-halo" aria-hidden="true" />
        <svg
          className="journey-paths"
          viewBox="0 0 330 274"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M70 44Q165 3 260 44Q319 137 260 231Q165 272 70 231Q11 137 70 44Z"
            stroke="#c9def8"
            strokeWidth="1"
          />
          <path
            key={step}
            className="journey-transmission"
            d={
              [
                "M70 231Q11 137 70 44",
                "M70 44Q165 3 260 44",
                "M260 44Q319 137 260 231",
                "M260 231Q165 272 70 231",
              ][step]
            }
            stroke="currentColor"
            strokeWidth="2"
            pathLength="1"
          />
          <circle cx="165" cy="138" r="66" stroke="white" strokeWidth="1.5" />
          <circle
            className="journey-orbit"
            cx="165"
            cy="138"
            r="77"
            stroke="#b8d7fb"
            strokeDasharray="1 9"
          />
        </svg>
        <div className="journey-center" aria-hidden="true">
          <div key={step} className="journey-art">
            <StageArt stage={step} />
          </div>
          <span>{stages[step].verb}</span>
          <small>WITH PURPOSE</small>
        </div>
        {stages.map((stage, index) => (
          <button
            key={stage.title}
            type="button"
            className={`journey-node journey-node-${index}`}
            aria-pressed={step === index}
            aria-describedby={step === index ? descriptionId : undefined}
            onClick={() => choose(index)}
          >
            <span className="journey-node-number">0{index + 1}</span>
            <span>
              <small>{stage.verb}</small>
              <strong>{stage.title}</strong>
            </span>
            {step === index && (
              <span
                key={step}
                className="journey-node-timer"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
      <div className="journey-caption" id={descriptionId}>
        <span>0{step + 1} / 04</span>
        <p key={step}>{stages[step].description}</p>
      </div>
      <div className="journey-controls">
        <span>Select a step to explore</span>
        <button
          type="button"
          onClick={play}
          disabled={!!reduced}
          aria-label={
            paused || manual
              ? "Play stewardship journey"
              : "Pause stewardship journey"
          }
        >
          <span aria-hidden="true">{paused || manual ? "▷" : "Ⅱ"}</span>
          {reduced
            ? "Reduced motion"
            : paused || manual
              ? "Play story"
              : "Pause story"}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

const stages = [
  {
    title: "Align",
    subtitle: "Meaningful work",
    description: "Connect each person’s work to a shared company outcome.",
    icon: "◎",
  },
  {
    title: "Reflect",
    subtitle: "Real evidence",
    description: "Bring results, context and learning into the conversation.",
    icon: "▤",
  },
  {
    title: "Grow",
    subtitle: "Lasting growth",
    description: "Agree an action, an owner and support. Put learning back into work.",
    icon: "↗",
  },
  {
    title: "Review",
    subtitle: "Human review",
    description: "AI supports the analysis. Your Head of HR validates the evidence.",
    icon: "⌕",
  },
];

export function PurposeJourney() {
  const [step, setStep] = useState(0);

  function previous() {
    setStep((value) => (value - 1 + stages.length) % stages.length);
  }

  function next() {
    setStep((value) => (value + 1) % stages.length);
  }

  return (
    <aside className="journey-panel">
      <div className="journey-title">
        THE STEWARDSHIP JOURNEY
      </div>

      <div className="journey-list">
        {stages.map((stage, index) => (
          <button
            key={stage.title}
            type="button"
            className="journey-item"
            data-active={step === index}
            onClick={() => setStep(index)}
          >
            <span className="journey-icon" aria-hidden="true">
              {stage.icon}
            </span>

            <span className="journey-item-copy">
              <strong>{stage.title}</strong>
              <small>{stage.subtitle}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="journey-footer">
        <div className="journey-count">
          0{step + 1} / 04
        </div>

        <div className="journey-bottom">
          <p key={step}>{stages[step].description}</p>

          <div className="journey-nav">
            <button type="button" onClick={previous} aria-label="Previous">
              ‹
            </button>

            <button type="button" onClick={next} aria-label="Next">
              ›
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
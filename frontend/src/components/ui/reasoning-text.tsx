"use client";
// beui.dev/components/agents/loading-states

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Loader } from "@/components/ui/reasoning-text-utils/loader";
import { TextScramble } from "@/components/ui/reasoning-text-utils/text-scramble";
import {
  EASE_OUT,
  SPRING_SWAP,
} from "@/components/ui/reasoning-text-utils/ease";
import {
  TEXT_SHIMMER_CLASS_NAME,
  TEXT_SHIMMER_KEYFRAMES,
  textShimmerStyle,
} from "@/components/ui/reasoning-text-utils/text-shimmer";
import { useWorkspaceMotion } from "@/components/workspace-motion";
const cn = (...values: (string | undefined)[]) =>
  values.filter(Boolean).join(" ");

const DEFAULT_PHRASES = [
  "Thinking",
  "Reading the context",
  "Connecting the details",
  "Forming a response",
];

const CASCADE_STAGGER = 0.025;

export type ReasoningTextVariant = "cascade" | "swap" | "scramble";

export interface ReasoningTextProps {
  /** Phrases cycled through while the agent works. */
  phrases?: string[];
  /** Animation used when the active phrase changes. */
  variant?: ReasoningTextVariant;
  /** Milliseconds each phrase remains visible. */
  interval?: number;
  /** Seconds taken for one shimmer pass. */
  shimmerDuration?: number;
  /** Optional leading visual. Defaults to a terminal-style ASCII loader. */
  indicator?: ReactNode;
  className?: string;
}

type PhraseProps = {
  phrase: string;
  reduce: boolean;
  shimmerDuration: number;
};

function CascadePhrase({ phrase, reduce, shimmerDuration }: PhraseProps) {
  const text = `${phrase}…`;

  if (reduce) {
    return (
      <span
        className={cn("reasoning-phrase", TEXT_SHIMMER_CLASS_NAME)}
        style={textShimmerStyle(shimmerDuration)}
      >
        {text}
      </span>
    );
  }

  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={phrase}
        className="reasoning-phrase"
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {text.split("").map((character, characterIndex) => (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: position is the stable cascade slot identity.
            key={characterIndex}
            custom={characterIndex * CASCADE_STAGGER}
            variants={{
              initial: { opacity: 0, y: "100%" },
              animate: (delay: number) => ({
                opacity: 1,
                y: "0%",
                transition: { ...SPRING_SWAP, delay },
              }),
              exit: (delay: number) => ({
                opacity: 0,
                y: "-100%",
                transition: {
                  duration: 0.14,
                  ease: EASE_OUT,
                  delay: delay * 0.45,
                },
              }),
            }}
            className={cn("reasoning-character", TEXT_SHIMMER_CLASS_NAME)}
            style={textShimmerStyle(shimmerDuration)}
          >
            {character}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}

function SwapPhrase({ phrase, reduce, shimmerDuration }: PhraseProps) {
  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={phrase}
        className={cn("reasoning-phrase", TEXT_SHIMMER_CLASS_NAME)}
        style={textShimmerStyle(shimmerDuration)}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
        transition={{
          duration: reduce ? 0.12 : 0.2,
          ease: EASE_OUT,
        }}
      >
        {phrase}…
      </motion.span>
    </AnimatePresence>
  );
}

function ScramblePhrase({ phrase, shimmerDuration }: PhraseProps) {
  const target = `${phrase}…`;

  return (
    <TextScramble
      key={target}
      text={target}
      className={cn("reasoning-phrase", TEXT_SHIMMER_CLASS_NAME)}
      style={textShimmerStyle(shimmerDuration)}
    />
  );
}

export function ReasoningText({
  phrases = DEFAULT_PHRASES,
  variant = "cascade",
  interval = 1800,
  shimmerDuration = 2.2,
  indicator,
  className,
}: ReasoningTextProps) {
  const systemReduce = useReducedMotion() ?? false;
  const { paused } = useWorkspaceMotion();
  const reduce = systemReduce || paused;
  const [index, setIndex] = useState(0);
  const statusId = useId();
  const safePhrases = phrases.length > 0 ? phrases : DEFAULT_PHRASES;
  const phrase = safePhrases[index % safePhrases.length];
  const longestPhrase = safePhrases.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );
  const phraseProps = { phrase, reduce, shimmerDuration };

  useEffect(() => {
    if (reduce || safePhrases.length < 2) return;

    const timer = window.setInterval(
      () => {
        setIndex((current) => (current + 1) % safePhrases.length);
      },
      Math.max(600, interval),
    );

    return () => window.clearInterval(timer);
  }, [interval, safePhrases.length, reduce]);

  return (
    <>
      <style>{TEXT_SHIMMER_KEYFRAMES}</style>
      <span
        role="status"
        aria-live="polite"
        aria-labelledby={statusId}
        data-reduced={reduce}
        className={cn("reasoning-text", className)}
      >
        <span aria-hidden="true" className="reasoning-indicator">
          {indicator ?? (
            <Loader
              variant="ascii-line"
              size={14}
              speed={0.8}
              label="Reasoning"
            />
          )}
        </span>

        <span aria-hidden="true" className="reasoning-stage">
          <span className="reasoning-measure">{longestPhrase}…</span>
          {reduce ? (
            <span className="reasoning-phrase">{phrase}…</span>
          ) : variant === "cascade" ? (
            <CascadePhrase {...phraseProps} />
          ) : variant === "scramble" ? (
            <ScramblePhrase {...phraseProps} />
          ) : (
            <SwapPhrase {...phraseProps} />
          )}
        </span>

        <span id={statusId} className="sr-only">
          Steward is preparing a response.
        </span>
      </span>
    </>
  );
}

export default ReasoningText;

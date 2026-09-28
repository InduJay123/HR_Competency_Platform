"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { useSession } from "./shell";
import { Button, Feedback, Loading } from "./ui";
const slides = [
  {
    label: "A shared purpose",
    title: "Your contribution has a longer story.",
    copy: "Beyond the Finish Line connects everyday work with the people, capability and systems that make success last.",
    steps: [
      "Contribute to purpose",
      "Reflect with context",
      "Leave a lasting impact",
    ],
  },
  {
    label: "Make work meaningful",
    title: "Start with a clear outcome.",
    copy: "Your manager defines what success looks like. Keep progress visible, raise blockers early and capture results with evidence.",
    steps: [
      "Understand the expected outcome",
      "Update progress and ask for support",
      "Capture the result and evidence",
    ],
  },
  {
    label: "A fairer conversation",
    title: "Bring your perspective. Bring the context.",
    copy: "At Mid-Year and Year-End, reflect on contribution, capability and stewardship. Your manager brings a separate perspective. Head of HR validates the evidence.",
    steps: ["Your reflection", "Manager appraisal", "Evidence validation"],
  },
  {
    label: "AI assists. People decide.",
    title: "A thoughtful coach, with a human in charge.",
    copy: "AI can suggest questions and support options from authorised sources. Head of HR reviews its suggestions and makes the formal assessment.",
    steps: [
      "Authorised sources only",
      "Suggestions with source references",
      "Human judgement and accountability",
    ],
  },
  {
    label: "Follow through",
    title: "Turn the conversation into your next chapter.",
    copy: "Agree three to five owned commitments, the support you need and how success will be recognised. Track progress without changing the saved review.",
    steps: [
      "Agree actions and manager support",
      "Acknowledge the shared record",
      "Build on your progress at Year-End",
    ],
  },
];
export function Onboarding() {
  const [index, setIndex] = useState(0),
    [profile, setProfile] = useState<Employee | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const session = useSession(),
    router = useRouter();
  useEffect(() => {
    api<Employee>("auth/profile/")
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);
  async function finish() {
    if (!profile) return;
    setBusy(true);
    try {
      await api("auth/profile/", {
        method: "PATCH",
        body: JSON.stringify({
          version: profile.version,
          complete_onboarding: true,
        }),
      });
      router.push("/employee/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile) return <Loading />;
  const slide = slides[index];
  return (
    <div className="onboarding">
      <section className="onboarding-copy">
        <p className="eyebrow">
          WELCOME, {profile.first_name.toUpperCase()} · {index + 1} OF 5
        </p>
        <h1>{slide.title}</h1>
        <p>{slide.copy}</p>
        <Feedback error={error} />
        <div
          className="onboarding-progress"
          aria-label={`Introduction step ${index + 1} of 5`}
        >
          {slides.map((s, i) => (
            <span key={s.label} className={i <= index ? "active" : ""} />
          ))}
        </div>
        <div className="actions">
          {index > 0 && (
            <Button variant="neutral" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() => (index === 4 ? finish() : setIndex(index + 1))}
          >
            {index === 4 ? "Enter my workspace" : "Continue →"}
          </Button>
        </div>
        <button className="text-button" onClick={finish} disabled={busy}>
          Skip introduction
        </button>
        <p className="onboarding-profile">
          {profile.first_name} {profile.last_name}
          <br />
          {profile.designation}
          {profile.joined_on ? ` · Since ${profile.joined_on.slice(0, 4)}` : ""}
        </p>
        <Link href="/employee/account">Check my profile →</Link>
        {session.contexts?.includes("hr") && (
          <p>
            Setting up your organisation? Start with{" "}
            <Link href="/hr/settings">company settings</Link>, then{" "}
            <Link href="/hr/organisation">departments and roles</Link>,{" "}
            <Link href="/hr/employees">people and reporting lines</Link>, and
            your <Link href="/hr/review-cycles">first review cycle</Link>.
          </p>
        )}
      </section>
      <section
        className="onboarding-visual"
        key={index}
        aria-label={slide.label}
      >
        <div className="glow-orbit" />
        <div className="glass-preview">
          <p className="eyebrow">BEYOND THE FINISH LINE</p>
          <h2>{slide.label}</h2>
          {slide.steps.map((text, i) => (
            <div className="onboarding-step" key={text}>
              <span>0{i + 1}</span>
              <strong>{text}</strong>
            </div>
          ))}
          <p>
            One person. Clear responsibilities.
            <br />A shared direction.
          </p>
        </div>
      </section>
    </div>
  );
}

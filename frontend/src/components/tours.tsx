"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { confirmLeaveDraft } from "@/lib/draft-guard";
import { Button } from "./ui";
export type TourRole = "employee" | "manager" | "hr";
export const tourSteps: Record<
  TourRole,
  { title: string; copy: string; path: string; target?: string }[]
> = {
  employee: [
    {
      title: "Your next useful step",
      copy: "Start with the action that needs attention. Your home brings work, reviews and development together.",
      path: "/employee/dashboard",
    },
    {
      title: "Keep work visible",
      copy: "Open an assignment to share progress, blockers, results and evidence.",
      path: "/employee/tasks",
    },
    {
      title: "Reflect with context",
      copy: "Save a private draft and select evidence. Submitting shares that version with your assigned reviewers.",
      path: "/employee/reviews",
    },
    {
      title: "Follow through on growth",
      copy: "Track actions and support agreed in your review conversation. Later progress does not change the final review.",
      path: "/employee/development",
    },
  ],
  manager: [
    {
      title: "Notice who needs support",
      copy: "Start with blockers, review readiness and commitments needing your attention.",
      path: "/manager/dashboard",
    },
    {
      title: "Assign a clear outcome",
      copy: "Give work a direct-report owner, an observable outcome and a deadline. Delegating a part keeps the parent assignment intact.",
      path: "/manager/tasks/create",
      target: 'textarea[name="expected_outcome"]',
    },
    {
      title: "Build a considered assessment",
      copy: "Use ECP, all five pillars and evidence. AI coaching is requested by the appointed Head of HR after both submissions.",
      path: "/manager/reviews",
    },
    {
      title: "Make the conversation count",
      copy: "Compare perspectives, agree supported commitments and acknowledge the shared record. Follow through on your manager support.",
      path: "/manager/development",
    },
  ],
  hr: [
    {
      title: "Start with your people",
      copy: "Check business emails and responsibilities before sending access invitations.",
      path: "/hr/employees",
    },
    {
      title: "Confirm reporting lines",
      copy: "Open an employee profile to set their manager. Resolve missing relationships; circular and self-reporting lines are rejected.",
      path: "/hr/employees",
    },
    {
      title: "Prepare before you launch",
      copy: "Preview participants, dates and the appointed Head of HR. Launch is a separate, deliberate action.",
      path: "/hr/review-cycles",
    },
    {
      title: "Follow the process",
      copy: "Track outstanding steps and completion. General HR oversight shows status without disclosing private review narratives.",
      path: "/hr/dashboard",
    },
  ],
};
const TourContext = createContext<(role: TourRole) => void>(() => {});
export const useTour = () => useContext(TourContext);
export function Tours({
  children,
  allowed,
  onContextChange,
}: {
  children: ReactNode;
  allowed: string[];
  onContextChange: (role: TourRole) => Promise<boolean>;
}) {
  const [active, setActive] = useState<{
    role: TourRole;
    index: number;
  } | null>(null);
  const router = useRouter(),
    path = usePathname(),
    panel = useRef<HTMLElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  const step = active ? tourSteps[active.role][active.index] : null;
  function close() {
    setActive(null);
    if (trigger.current?.isConnected) trigger.current.focus();
    else document.getElementById("main")?.focus();
  }
  useEffect(() => {
    if (!active || !step) return;
    panel.current?.focus();
    const highlighted = document.querySelector(
      step.target || `nav a[href="${step.path}"]`,
    );
    highlighted?.classList.add("tour-highlight");
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActive(null);
        if (trigger.current?.isConnected) trigger.current.focus();
        else document.getElementById("main")?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      highlighted?.classList.remove("tour-highlight");
      document.removeEventListener("keydown", escape);
    };
  }, [active, step, path]);
  async function start(role: TourRole) {
    if (!allowed.includes(role) || !confirmLeaveDraft()) return;
    trigger.current = document.activeElement as HTMLElement;
    if (!(await onContextChange(role))) return;
    setActive({ role, index: 0 });
    router.push(tourSteps[role][0].path);
  }
  function next() {
    if (!active || !confirmLeaveDraft()) return;
    if (active.index === 3) return close();
    const index = active.index + 1;
    setActive({ ...active, index });
    router.push(tourSteps[active.role][index].path);
  }
  return (
    <TourContext value={start}>
      {children}
      {active && step && (
        <section
          ref={panel}
          className="tour-callout"
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-title"
          aria-describedby="tour-copy"
          tabIndex={-1}
        >
          <p className="eyebrow">
            {active.role} tour · {active.index + 1} of 4
          </p>
          <h2 id="tour-title">{step.title}</h2>
          <p id="tour-copy">{step.copy}</p>
          <div className="actions">
            <Button variant="neutral" onClick={close}>
              Skip tour
            </Button>
            <Button onClick={next}>
              {active.index === 3 ? "Finish" : "Next"}
            </Button>
          </div>
          <small>
            Optional guidance. No automatic data changes. Escape closes.
          </small>
        </section>
      )}
    </TourContext>
  );
}

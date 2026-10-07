"use client";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { StewardBot, type StewardMood } from "./steward-bot";
import ReasoningText from "./ui/reasoning-text";
import { MotionToggle } from "./workspace-motion";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, allPages, post } from "@/lib/api";
import { Button, Feedback } from "./ui";

type Conversation = { id: string; title: string };
type Message = {
  id: string | number;
  role: "user" | "assistant";
  content: string;
};
const lessons = [
  {
    title: "Define a useful outcome",
    text: "Start with the company objective. Describe what will change, who benefits, and what evidence will demonstrate success. Agree an owner and a realistic deadline. Practice: rewrite one task as ‘By [date], [owner] will achieve [outcome], evidenced by [measure].’",
  },
  {
    title: "Have a better check-in",
    text: "Ask what has progressed, what is blocked and what support is needed. Listen before offering solutions. Agree one next step, its owner and a check-in date. Practice: prepare one open question for your next conversation.",
  },
  {
    title: "Delegate with clarity",
    text: "Explain the outcome, decision boundaries, resources and deadline. Ask the colleague to describe their approach. Agree how and when progress will be shared. The delegating manager retains accountability for the overall result.",
  },
  {
    title: "Reflect with evidence",
    text: "Describe the situation, your contribution, the result and what you learned. Include constraints and contributions beyond assigned work, such as mentoring. Link authorised evidence. Avoid claiming outcomes you cannot support.",
  },
];

export function Trainer() {
  const [open, setOpen] = useState(false),
    [available, setAvailable] = useState<boolean | null>(null),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [selected, setSelected] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [attachment, setAttachment] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [lesson, setLesson] = useState<number | null>(null),
    [composing, setComposing] = useState(false);
  const panel = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    end = useRef<HTMLDivElement>(null),
    restoreFocus = useRef(false);
  useEffect(() => {
    if (!open && restoreFocus.current) {
      launcher.current?.focus();
      restoreFocus.current = false;
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    api<{ available: boolean }>("trainer/status/")
      .then((x) => setAvailable(x.available))
      .catch((e) => setError(e.message));
    allPages<Conversation>("trainer/conversations/")
      .then(setConversations)
      .catch((e) => setError(e.message));
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages, busy]);
  function close() {
    restoreFocus.current = true;
    setOpen(false);
  }
  async function choose(id: string) {
    setLesson(null);
    setError("");
    setBusy(true);
    try {
      const loaded = id
        ? await api<Message[]>(`trainer/conversations/${id}/messages/`)
        : [];
      setMessages(loaded);
      setSelected(id);
      setDraft("");
      setAttachment(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && !attachment) || busy || !available) return;
    setBusy(true);
    setError("");
    setSending(true);
    const content = draft.trim();
    const displayContent = content || "Document self-evaluation";
    try {
      let id = selected;
      if (!id) {
        const c = await post<Conversation>("trainer/conversations/", {
          title: displayContent.slice(0, 100),
        });
        id = c.id;
        setSelected(id);
        setConversations((xs) => [c, ...xs]);
      }
      const path = `trainer/conversations/${id}/messages/`;
      let reply: Message;
      if (attachment) {
        const body = new FormData();
        body.append("content", content);
        body.append("file", attachment);
        reply = await api<Message>(path, { method: "POST", body });
      } else {
        reply = await post<Message>(path, { content });
      }
      setMessages((xs) => [
        ...xs,
        { id: `u-${reply.id}`, role: "user", content: displayContent },
        reply,
      ]);
      setDraft("");
      setAttachment(null);
      setLesson(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setSending(false);
    }
  }
  const mood: StewardMood = busy
    ? "thinking"
    : error
      ? "error"
      : composing
        ? "attentive"
        : messages.length || lesson !== null
          ? "happy"
          : "idle";
  return (
    <div className="trainer-anchor">
      {open && (
        <div
          className="trainer-panel"
          role="dialog"
          aria-label="Steward corporate trainer"
          tabIndex={-1}
          ref={panel}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="trainer-heading">
            <div>
              <strong>Steward</strong>
              <small>
                {busy
                  ? "Preparing your response…"
                  : composing
                    ? "Ready for your question"
                    : "Your AI corporate trainer"}
              </small>
            </div>
            <button aria-label="Close corporate trainer" onClick={close}>
              ×
            </button>
          </div>
          <div className="trainer-motion-control">
            <MotionToggle />
          </div>
          <div className="trainer-mode">
            <span className={available ? "online-dot" : "offline-dot"} />
            {available ? "Live AI training" : "Learning guides"}
            <button disabled={busy} onClick={() => choose("")}>
              New chat
            </button>
          </div>
          {conversations.length > 0 && (
            <label className="trainer-history">
              Conversations
              <select
                aria-label="Saved training conversations"
                value={selected}
                disabled={busy}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">New conversation</option>
                {conversations.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="trainer-scroll">
            {!messages.length && (
              <>
                <h2>What would you like to grow?</h2>
                <p>
                  Practise a skill, prepare a conversation or make your next
                  outcome clearer.
                </p>
                <div className="trainer-lessons">
                  {lessons.map((l, i) => (
                    <button key={l.title} onClick={() => setLesson(i)}>
                      {l.title} <span>↗</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {lesson !== null && (
              <article className="trainer-lesson">
                <small>TRAINING GUIDE · NOT AI GENERATED</small>
                <h3>{lessons[lesson].title}</h3>
                <p>{lessons[lesson].text}</p>
                {available && (
                  <button
                    onClick={() =>
                      setDraft(`Help me practise: ${lessons[lesson].title}`)
                    }
                  >
                    Practise with Steward
                  </button>
                )}
              </article>
            )}
            <div
              role="log"
              aria-label="Training conversation"
              aria-live="polite"
            >
              {messages.map((m) => (
                <article key={m.id} className={`trainer-message ${m.role}`}>
                  <strong>{m.role === "user" ? "You" : "Steward · AI"}</strong>
                  {m.role === "assistant" ? (
                    <div className="trainer-markdown">
                      <ReactMarkdown skipHtml>
                        {m.content
                          .replace(/&#x20;/g, " ")
                          .replace(/\\([*#-])/g, "$1")
                          .replace(/^(\s*\d+)\\\.(?=\s)/gm, "$1.")}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p>{m.content}</p>
                  )}
                </article>
              ))}
            </div>
            {sending ? (
              <div className="trainer-working">
                <ReasoningText
                  phrases={[
                    "Thinking",
                    "Preparing your response",
                    "Working on your question",
                  ]}
                />
              </div>
            ) : busy ? (
              <p role="status">Loading conversation…</p>
            ) : null}
            <Feedback error={error} />
            <div ref={end} />
          </div>
          {available === false && (
            <p className="trainer-setup">
              Live chat awaits your administrator’s OpenAI setup. You can
              explore the learning guides now.
            </p>
          )}
          <div className="trainer-attachments">
            <div className="trainer-attachment-toolbar">
              <button
                className="trainer-attachment-trigger"
                type="button"
                aria-describedby="trainer-attachment-help"
                disabled={!available || busy}
                onClick={() => fileInput.current?.click()}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 6" />
                </svg>
                Attach document
              </button>
              <span
                id="trainer-attachment-help"
                className="trainer-attachment-help"
              >
                PDF, DOCX, TXT · max 10 MB
              </span>
            </div>
            <input
              ref={fileInput}
              className="sr-only trainer-attachment-input"
              tabIndex={-1}
              type="file"
              aria-label="Attach document"
              aria-describedby="trainer-attachment-help"
              accept=".pdf,.docx,.txt"
              disabled={!available || busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
                  setError("Upload a PDF, DOCX or TXT file.");
                } else if (file.size > 10 * 1024 * 1024) {
                  setError("Document must be 10 MB or smaller.");
                } else if (!file.size) {
                  setError("The uploaded document is empty.");
                } else {
                  setAttachment(file);
                  setError("");
                }
              }}
            />
            {attachment && (
              <div className="trainer-attachment-card">
                <svg
                  className="trainer-attachment-document"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6M8 13h8M8 17h5" />
                </svg>
                <div className="trainer-attachment-details">
                  <span
                    className="trainer-attachment-name"
                    title={attachment.name}
                  >
                    {attachment.name}
                  </span>
                  <span className="trainer-attachment-help">
                    {attachment.name.split(".").pop()?.toUpperCase()} · ready to
                    analyze
                  </span>
                </div>
                <button
                  className="trainer-attachment-remove"
                  type="button"
                  aria-label="Remove attachment"
                  title="Remove attachment"
                  disabled={busy}
                  onClick={() => setAttachment(null)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            )}
            
          </div>
          <form className="trainer-compose" onSubmit={send}>
            <label className="sr-only" htmlFor="trainer-draft">
              Message Steward
            </label>
            <textarea
              id="trainer-draft"
              onFocus={() => setComposing(true)}
              onBlur={() => setComposing(false)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={4000}
              rows={2}
              disabled={!available || busy}
              placeholder={
                available
                  ? "Ask a training question…"
                  : "Live chat is not connected yet"
              }
            />
            <Button
              disabled={!available || busy || (!draft.trim() && !attachment)}
              aria-label="Send training message"
            >
              Send
            </Button>
          </form>
          <p className="trainer-note">
            AI can make mistakes. Use your judgement and avoid sharing
            confidential employee information.{" "}
            <Link href="/employee/guide" onClick={close}>
              Stewardship Guide
            </Link>
          </p>
        </div>
      )}
      <button
        ref={launcher}
        hidden={open}
        className="trainer-launcher"
        aria-label="Open corporate trainer"
        title="Ask Steward"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <StewardBot mood={mood} />
      </button>
    </div>
  );
}

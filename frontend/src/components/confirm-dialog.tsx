"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button, Feedback } from "./ui";
import styles from "./confirm-dialog.module.css";

// Mount only while confirmation is requested. Native showModal supplies the
// top layer, inert background and keyboard focus containment.
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const section = trigger?.closest("section");
    element.showModal();
    cancel.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      // A successful acknowledgement/finalisation can remove its trigger.
      const destination = trigger?.isConnected
        ? trigger
        : section?.isConnected
          ? section
          : document.querySelector("h1");
      if (destination instanceof HTMLElement) {
        const previous = destination.getAttribute("tabindex");
        if (destination !== trigger) destination.setAttribute("tabindex", "-1");
        destination.focus({ preventScroll: true });
        if (destination !== trigger) {
          if (previous === null) destination.removeAttribute("tabindex");
          else destination.setAttribute("tabindex", previous);
        }
      }
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={loading}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <Feedback error={error} />
      {loading && <p role="status">Saving your review action…</p>}
      <div className={styles.actions}>
        <Button disabled={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button
          ref={cancel}
          variant="neutral"
          disabled={loading}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
